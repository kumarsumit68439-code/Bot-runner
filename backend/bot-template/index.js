// Assembles full bot from botchunk_00.js .. botchunk_13.js
"use strict";
const fs = require("fs");
const path = require("path");
const n = 14;
const parts = [];
for (let i = 0; i < n; i++) {
  const p = path.join(__dirname, "botchunk_" + String(i).padStart(2, "0") + ".js");
  if (!fs.existsSync(p)) {
    console.error("Missing", p);
    process.exit(1);
  }
  parts.push(fs.readFileSync(p, "utf8"));
}
const out = path.join(__dirname, "_assembled_bot.js");
fs.writeFileSync(out, parts.join(""));
require(out);
