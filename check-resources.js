const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cname = fs.readFileSync(path.join(root, "CNAME"), "utf8").trim();
const errors = [];

if (cname !== "tachyharmonic.ai") {
  errors.push("Root CNAME must contain tachyharmonic.ai");
}

const idList = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const ids = new Set(idList);
if (ids.size !== idList.length) errors.push("Duplicate HTML id");
if (!/<main\b/.test(html) || !/<nav\b/.test(html) || !/<h1\b/.test(html)) {
  errors.push("Missing main, navigation, or primary heading");
}
for (const image of html.matchAll(/<img\b[^>]*>/g)) {
  if (!/\balt="[^"]*"/.test(image[0])) errors.push("Image missing alt text");
}
for (const [, attribute, value] of html.matchAll(/\b(src|href)="([^"]+)"/g)) {
  if (value.startsWith("#")) {
    if (!ids.has(value.slice(1))) errors.push("Broken anchor: " + value);
    continue;
  }
  if (/^(https?:|mailto:|tel:|data:)/.test(value)) continue;
  const relativePath = value.split(/[?#]/, 1)[0];
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) {
    errors.push("Missing " + attribute + " target: " + value);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Domain, anchors, and local resources verified.");
}
