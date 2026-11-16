#!/usr/bin/env bash
# BotHost one-command setup (native Termux or Ubuntu/Debian proot).
#   curl -fsSL https://raw.githubusercontent.com/kumarsumit68439-code/Bot-runner/main/setup.sh | bash
# Safe to re-run: keeps your AUTH_TOKEN, restarts the daemon and the tunnel, prints a fresh magic link.
set -euo pipefail

PANEL_URL="${PANEL_URL:-https://bot-runner-six.vercel.app}"
PANEL_URL="${PANEL_URL%/}"
REPO_URL="https://github.com/kumarsumit68439-code/Bot-runner.git"
APP_DIR="$HOME/Bot-runner"
BACKEND="$APP_DIR/backend"
DEFAULT_PORT=8080
LOGS="$HOME/.pm2/logs"

say() { printf '\n== %s ==\n' "$1"; }

# sudo only when we are not root and sudo exists (Termux has neither)
SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi
run() { if [ -n "$SUDO" ]; then sudo "$@"; else "$@"; fi; }

say "1/6 Packages"
if command -v pkg >/dev/null 2>&1; then
  pkg update -y
  pkg install -y nodejs git cloudflared openssl curl
  if command -v termux-wake-lock >/dev/null 2>&1; then termux-wake-lock || true; fi
elif command -v apt-get >/dev/null 2>&1; then
  run apt-get update -y
  run apt-get install -y curl git openssl ca-certificates
  NODE_MAJOR=0
  if command -v node >/dev/null 2>&1; then NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"; fi
  if [ "$NODE_MAJOR" -lt 18 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh
    run bash /tmp/nodesource_setup.sh
    run apt-get install -y nodejs
  fi
  if ! command -v cloudflared >/dev/null 2>&1; then
    case "$(uname -m)" in
      aarch64|arm64) CF_ARCH=arm64 ;;
      x86_64) CF_ARCH=amd64 ;;
      armv7l|armv8l) CF_ARCH=arm ;;
      *) echo "Unsupported CPU: $(uname -m)"; exit 1 ;;
    esac
    curl -fsSL -o /tmp/cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH"
    run install -m 755 /tmp/cloudflared /usr/local/bin/cloudflared
  fi
else
  echo "Neither pkg (Termux) nor apt-get was found."
  exit 1
fi
if ! command -v pm2 >/dev/null 2>&1; then run npm install -g pm2; fi

say "2/6 Code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$BACKEND"
npm install --omit=dev
mkdir -p bot
[ -f bot/index.js ] || cp bot-template/index.js bot/index.js
(
  cd bot
  [ -f package.json ] || npm init -y >/dev/null
  [ -d node_modules/discord.js ] || npm install discord.js dotenv
)

say "3/6 Config (backend/.env)"
touch .env
chmod 600 .env
get_env() { grep "^$1=" .env | head -n 1 | cut -d= -f2- || true; }
set_env() {
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}
if [ "$(get_env AUTH_TOKEN | wc -c)" -lt 17 ]; then set_env AUTH_TOKEN "$(openssl rand -hex 24)"; fi
[ -n "$(get_env PORT)" ] || set_env PORT "$DEFAULT_PORT"
[ -n "$(get_env HOST)" ] || set_env HOST 127.0.0.1
ORIGINS="$(get_env ALLOWED_ORIGINS)"
if [ -z "$ORIGINS" ] || [ "$ORIGINS" = "*" ]; then set_env ALLOWED_ORIGINS "$PANEL_URL"; fi
# Start the bot automatically after a daemon restart once credentials exist
if [ -f bot/bot-credentials.json ] || grep -qs '^DISCORD_TOKEN=.' bot/.env; then
  set_env AUTO_START true
else
  [ -n "$(get_env AUTO_START)" ] || set_env AUTO_START false
fi
AUTH_TOKEN="$(get_env AUTH_TOKEN)"
PORT="$(get_env PORT)"

say "4/6 Start daemon and tunnel (PM2)"
pm2 delete bot-panel >/dev/null 2>&1 || true
pm2 start server.js --name bot-panel
pm2 delete tunnel >/dev/null 2>&1 || true
mkdir -p "$LOGS"
: > "$LOGS/tunnel-out.log"
: > "$LOGS/tunnel-error.log"
pm2 start "$(command -v cloudflared)" --name tunnel --interpreter none -- \
  tunnel --no-autoupdate --protocol http2 --url "http://127.0.0.1:$PORT"
pm2 save

say "5/6 Waiting for the daemon"
for _ in $(seq 1 20); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 || { echo "Daemon did not start. Check: pm2 logs bot-panel"; exit 1; }
echo "Daemon OK on 127.0.0.1:$PORT"

say "6/6 Waiting for the tunnel URL (up to 60s)"
TUNNEL_URL=""
for _ in $(seq 1 30); do
  TUNNEL_URL="$(cat "$LOGS/tunnel-out.log" "$LOGS/tunnel-error.log" 2>/dev/null \
    | grep -o 'https://[-0-9a-z]*\.trycloudflare\.com' | grep -v '^https://api\.' | tail -n 1 || true)"
  [ -n "$TUNNEL_URL" ] && break
  sleep 2
done
[ -n "$TUNNEL_URL" ] || { echo "No tunnel URL found. Check: pm2 logs tunnel"; exit 1; }

LINK="${PANEL_URL}/#tunnel=${TUNNEL_URL}&token=${AUTH_TOKEN}"
umask 077
printf '%s\n' "$LINK" > "$HOME/bothost-link.txt"

echo
echo "=========================================="
echo "Setup complete! Open this link in your phone browser:"
echo
echo "$LINK"
echo
echo "Confirm the host in the popup, then enter your Discord Bot Token and Client ID in the panel."
echo "The link contains your secret token: do not share it (also saved in ~/bothost-link.txt)."
echo "The quick-tunnel URL changes on every restart: run this script again for a new link."
echo "=========================================="
