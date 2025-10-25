import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lucide Dices icon SVG path data
const dicesIconPath = `
  <rect width="12" height="12" x="2" y="10" rx="2" ry="2"/>
  <path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/>
  <path d="M6 18h.01"/>
  <path d="M10 14h.01"/>
  <path d="M15 6h.01"/>
  <path d="M18 9h.01"/>
`;

// Generate SVG favicon with a nice background
function generateSVGFavicon(size: number, bgColor: string, iconColor: string): string {
  const padding = size * 0.15;
  const iconSize = size - padding * 2;
  const scale = iconSize / 24; // Lucide icons are 24x24

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${bgColor}" rx="${size * 0.15}"/>
  <g transform="translate(${padding}, ${padding}) scale(${scale})" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${dicesIconPath.trim()}
  </g>
</svg>`;
}

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate favicons
const favicons = [
  { name: 'favicon.svg', size: 32, bgColor: '#000000', iconColor: '#ffffff' },
  { name: 'favicon-16x16.svg', size: 16, bgColor: '#000000', iconColor: '#ffffff' },
  { name: 'favicon-32x32.svg', size: 32, bgColor: '#000000', iconColor: '#ffffff' },
  { name: 'apple-touch-icon.svg', size: 180, bgColor: '#000000', iconColor: '#ffffff' },
];

favicons.forEach(({ name, size, bgColor, iconColor }) => {
  const svg = generateSVGFavicon(size, bgColor, iconColor);
  const filePath = path.join(publicDir, name);
  fs.writeFileSync(filePath, svg);
  console.log(`✓ Generated ${name} (${size}x${size})`);
});

console.log('\nFavicon generation complete!');
console.log('Add these to your root.tsx links function:');
console.log(`
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon-32x32.svg", type: "image/svg+xml", sizes: "32x32" },
  { rel: "icon", href: "/favicon-16x16.svg", type: "image/svg+xml", sizes: "16x16" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.svg", sizes: "180x180" },
`);
