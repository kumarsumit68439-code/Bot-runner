// Assembler: botchunk_00.b64 .. botchunk_39.b64 -> full bot (AI setup + no-mention aichat + voice)
"use strict";
const fs = require("fs"), path = require("path");
const n = 40, bufs = [];
for (let i = 0; i < n; i++) {
  const p = path.join(__dirname, "botchunk_" + String(i).padStart(2, "0") + ".b64");
  if (!fs.existsSync(p)) { console.error("Missing", p); process.exit(1); }
  bufs.push(Buffer.from(fs.readFileSync(p, "utf8").replace(/\s+/g, ""), "base64"));
}
const out = path.join(__dirname, "_assembled_bot.js");
fs.writeFileSync(out, Buffer.concat(bufs));
console.log("[assembler] wrote", out, Buffer.concat(bufs).length, "bytes");
require(out);
