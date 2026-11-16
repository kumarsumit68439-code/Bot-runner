// Assembles full bot from index.part1.js + index.part2.js (GitHub size-friendly)
"use strict";
const fs = require("fs");
const path = require("path");
const p1 = path.join(__dirname, "index.part1.js");
const p2 = path.join(__dirname, "index.part2.js");
const out = path.join(__dirname, "_assembled_bot.js");
if (!fs.existsSync(p1) || !fs.existsSync(p2)) {
  console.error("Missing index.part1.js or index.part2.js next to index.js");
  process.exit(1);
}
const code = fs.readFileSync(p1, "utf8") + fs.readFileSync(p2, "utf8");
fs.writeFileSync(out, code);
require(out);
