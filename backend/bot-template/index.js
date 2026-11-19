// Full bot — 14 plain JS parts (NO base64). Railway + Termux.
"use strict";
const fs = require("fs");
const path = require("path");
const n = 14;
const parts = [];
for (let i = 0; i < n; i++) {
  const p = path.join(__dirname, "bp_" + String(i).padStart(2, "0") + ".js");
  if (!fs.existsSync(p)) {
    console.error("Missing", p, "— pull latest Bot-runner backend/bot-template/bp_00..13.js");
    process.exit(1);
  }
  parts.push(fs.readFileSync(p, "utf8"));
}
const code = parts.join("");
const out = path.join(__dirname, "_run.js");
fs.writeFileSync(out, code);
require(out);
