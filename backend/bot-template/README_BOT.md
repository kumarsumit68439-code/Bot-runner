# Full Discord Bot (AI setupchannels + setuproles + no-mention AI chat)

## Real AI features

### `/setupchannels` or `!setupchannels <prompt>`
- Admin only + AI API key required
- Example: `/setupchannels prompt: gaming server with general, music VC, support category and welcome channel`
- Bot calls your AI → gets JSON plan → **really creates** categories, text channels and voice channels on the server

### `/setuproles` or `!setuproles <prompt>`
- Admin only + AI API key required
- Example: `/setuproles prompt: Admin red hoist, Moderator blue, Member green, Supporter purple mentionable`
- Bot calls your AI → gets JSON plan → **really creates** roles with colors/hoist/mentionable

### AI Chat (no tag / no mention)
- In `#ai-chat` channel just type a message — bot replies **without** @mention
- Turn on AI Chat module + set API key in panel (Modules or Environment)

### Voice + Music
- `/joinvc channel_id:123...` join any VC by ID
- `/play query:song name channel_id:...` play with mini player buttons

## Assemble on Termux / phone

```bash
cd ~/Bot-runner   # or your clone path
git pull

cd backend/bot-template
# needs: gzchunk_00.b64 ... gzchunk_09.b64 + index.js (assembler)
node index.js
# → writes _assembled_bot.js and starts the bot

# Or only write the file without starting:
node -e '
const fs=require("fs"),path=require("path"),zlib=require("zlib");
let b="";
for(let i=0;i<10;i++){
  const p=path.join(__dirname,"gzchunk_"+String(i).padStart(2,"0")+".b64");
  if(!fs.existsSync(p)){console.error("Missing",p);process.exit(1);}
  b+=fs.readFileSync(p,"utf8").replace(/\s+/g,"");
}
const js=zlib.gunzipSync(Buffer.from(b,"base64"));
fs.writeFileSync("index.js",js);
console.log("Wrote full index.js",js.length,"bytes");
'

# Copy into running bot folder and restart
cp index.js ../bot/index.js   # if bot runs from backend/bot/
# then pm2 restart or panel Power → Restart
```

Repo: https://github.com/kumarsumit68439-code/Bot-runner
