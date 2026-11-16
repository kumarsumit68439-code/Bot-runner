// Assembles full bot from botchunk_00.b64 .. botchunk_13.b64
"use strict";
const fs = require("fs");
const path = require("path");
const n = 14;
const bufs = [];
for (let i = 0; i < n; i++) {
  const p = path.join(__dirname, "botchunk_" + String(i).padStart(2, "0") + ".b64");
  if (!fs.existsSync(p)) {
    console.error("Missing", p);
    process.exit(1);
  }
  bufs.push(Buffer.from(fs.readFileSync(p, "utf8").replace(/\s+/g, ""), "base64"));
}
const out = path.join(__dirname, "_assembled_bot.js");
fs.writeFileSync(out, Buffer.concat(bufs));
require(out);
