// scripts/gen-icons.js
// Writes three placeholder blue-square PNGs to static/shared/icons/.
// The manifest declares 16/48/128 sizes; browsers will scale as needed.
// Replace with real artwork before publishing.

import { writeFileSync, mkdirSync } from 'fs';

// Minimal 1x1 solid blue (#2563eb) PNG, base64.
const PNG_1x1_BLUE =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAFklEQVR4nGNkYPhfz4AFMOESBIAAAP//AIQCAgh0CjwAAAAASUVORK5CYII=';

const bytes = Buffer.from(PNG_1x1_BLUE, 'base64');

mkdirSync('static/shared/icons', { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`static/shared/icons/icon_${size}.png`, bytes);
}
console.log('placeholder icons written to static/shared/icons/');
