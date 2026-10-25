// Vercel expects an output folder named "public" after the build. The API has no static pages,
// so this just guarantees the folder exists (and also keeps crawlers away from the API).
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'public');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log('public/ ready');
