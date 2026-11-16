// Assembler: botchunk_00.b64 .. botchunk_39.b64 -> full bot (plain JS, verified syntax)
// After first run, _assembled_bot.js is the complete bot. Copy it over index.js if you want a single file.
"use strict";
const fs = require("fs");
const path = require("path");
const n = 40;
const bufs = [];
for (let i = 0; i < n; i++) {
  const p = path.join(__dirname, "botchunk_" + String(i).padStart(2, "0") + ".b64");
  if (!fs.existsSync(p)) {
    console.error("Missing", p, "— pull latest from GitHub (all 40 chunks required).");
    process.exit(1);
  }
  const raw = fs.readFileSync(p, "utf8").replace(/\s+/g, "");
  bufs.push(Buffer.from(raw, "base64"));
}
const code = Buffer.concat(bufs);
const out = path.join(__dirname, "_assembled_bot.js");
fs.writeFileSync(out, code);
console.log("[assembler] wrote", out, code.length, "bytes");
// Also overwrite a single-file copy for convenience
fs.writeFileSync(path.join(__dirname, "bot.full.js"), code);
console.log("[assembler] also wrote bot.full.js — this is the complete bot (AI setupchannels/setuproles + no-mention aichat)");
require(out);
