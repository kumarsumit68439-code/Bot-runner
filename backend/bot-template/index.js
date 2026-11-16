// Assembles full bot from index.part1.js .. index.part4.js
"use strict";
const fs = require("fs");
const path = require("path");
const parts = [1, 2, 3, 4].map((i) => path.join(__dirname, "index.part" + i + ".js"));
for (const p of parts) {
  if (!fs.existsSync(p)) {
    console.error("Missing", p);
    process.exit(1);
  }
}
const out = path.join(__dirname, "_assembled_bot.js");
fs.writeFileSync(out, parts.map((p) => fs.readFileSync(p, "utf8")).join(""));
require(out);
