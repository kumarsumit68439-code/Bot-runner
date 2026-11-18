# Optional: use if you prefer Docker on Railway instead of Nixpacks
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.js ./
COPY bot-template ./bot-template

RUN mkdir -p bot \
  && cp bot-template/index.js bot/index.js \
  && cd bot \
  && npm init -y \
  && npm install discord.js dotenv @discordjs/voice play-dl opusscript --omit=dev || true

ENV HOST=0.0.0.0
ENV NODE_ENV=production
# Railway injects PORT
EXPOSE 8080

CMD ["node", "server.js"]
