// Full bot loader — 4 plain JS parts (NO base64). Works on Railway + Termux.
"use strict";
const fs = require("fs");
const path = require("path");
const parts = [];
for (let i = 0; i < 4; i++) {
  const p = path.join(__dirname, "botp_" + i + ".js");
  if (!fs.existsSync(p)) {
    console.error("Missing", p, "— redeploy after botp_0..3.js are on GitHub.");
    process.exit(1);
  }
  parts.push(fs.readFileSync(p, "utf8"));
}
const code = parts.join("");
const out = path.join(__dirname, "_run.js");
fs.writeFileSync(out, code);
require(out);
