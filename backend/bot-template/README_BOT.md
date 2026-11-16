# Bot template (full features)

## Features ready
- **AI Chat**: In `#ai-chat` (or set channel) just type — **no @mention / tag needed**. Bot replies directly.
- **`/setupchannels <prompt>`** or `!setupchannels describe layout`: AI creates categories, text channels and VCs from your description.
- **`/setuproles <prompt>`** or `!setuproles describe roles`: AI creates roles (color, hoist, mentionable) from prompt.
- **`/joinvc channel_id:123...`**: Join any voice channel by ID.
- **`/play query:... channel_id:...`**: Play YouTube music + mini player buttons (play/pause/skip/stop) in the text channel.
- Slash + prefix commands, all 18 modules, YouTube cookies/API support, Environment tab, resource specs.

## How to get full index.js on mobile / Termux
```bash
cd backend/bot-template
# If all botchunk_00.b64 ... botchunk_39.b64 present:
node index.js   # assembler runs and starts bot
# Or manually:
node -e "
const fs=require('fs'),path=require('path');
const bufs=[];
for(let i=0;i<40;i++){
  const p=path.join(__dirname,'botchunk_'+String(i).padStart(2,'0')+'.b64');
  if(!fs.existsSync(p)){console.error('Missing',p);process.exit(1);}
  bufs.push(Buffer.from(fs.readFileSync(p,'utf8').replace(/\s+/g,''),'base64'));
}
fs.writeFileSync('index.js',Buffer.concat(bufs));
console.log('Wrote full index.js', Buffer.concat(bufs).length, 'bytes');
"
```
Then copy to bot folder and restart with pm2.

Chunks 00-19 already on repo. Remaining chunks are being added. Once complete, run the assembler above.

Repo: https://github.com/kumarsumit68439-code/Bot-runner
