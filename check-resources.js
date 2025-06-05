const fs = require('fs');
const path = require('path');
const html = fs.readFileSync('index.html', 'utf-8');
const regex = /(src|href)="([^"]+)"/g;
let missing = [];
let match;
while ((match = regex.exec(html)) !== null) {
  const attr = match[1];
  const file = match[2];
  if (/^https?:\/\//.test(file) || file.startsWith('data:') || file.startsWith('//')) {
    continue; // external resource
  }
  const filepath = path.join(__dirname, file);
  if (!fs.existsSync(filepath)) {
    missing.push(file);
  }
}
if (missing.length) {
  console.error('Missing resources:', missing.join(', '));
  process.exit(1);
} else {
  console.log('All resources exist');
}
