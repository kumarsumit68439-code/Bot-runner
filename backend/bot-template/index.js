// Gzip assembler — gzchunk_00.b64 .. gzchunk_09.b64 -> full bot with AI setupchannels/setuproles + no-mention aichat
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const n = 10;
let b64 = "";
for (let i = 0; i < n; i++) {
  const p = path.join(__dirname, "gzchunk_" + String(i).padStart(2, "0") + ".b64");
  if (!fs.existsSync(p)) {
    console.error("Missing", p);
    process.exit(1);
  }
  b64 += fs.readFileSync(p, "utf8").replace(/\s+/g, "");
}
const gz = Buffer.from(b64, "base64");
const js = zlib.gunzipSync(gz);
const out = path.join(__dirname, "_assembled_bot.js");
fs.writeFileSync(out, js);
console.log("[assembler] full bot written", out, js.length, "bytes — AI /setupchannels /setuproles ready");
require(out);
