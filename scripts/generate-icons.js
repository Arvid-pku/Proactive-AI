/**
 * Generate extension icons programmatically
 * Run with: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Simple SVG icon generator
function generateIconSVG(size) {
  const center = size / 2;
  const starSize = size * 0.3;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${size}" height="${size}" fill="url(#grad)" rx="${size * 0.1}"/>
  
  <!-- Main sparkle -->
  <g transform="translate(${center}, ${center})">
    <path d="M 0,-${starSize} L ${starSize * 0.3},-${starSize * 0.3} L ${starSize},0 L ${starSize * 0.3},${starSize * 0.3} L 0,${starSize} L -${starSize * 0.3},${starSize * 0.3} L -${starSize},0 L -${starSize * 0.3},-${starSize * 0.3} Z" 
          fill="white" 
          opacity="0.95"/>
  </g>
  
  ${size >= 48 ? `
  <!-- Small sparkles -->
  <circle cx="${center * 1.4}" cy="${center * 0.6}" r="${size * 0.05}" fill="white" opacity="0.8"/>
  <circle cx="${center * 0.6}" cy="${center * 1.4}" r="${size * 0.04}" fill="white" opacity="0.7"/>
  ` : ''}
</svg>`;
}

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, '../src/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate icons
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const svg = generateIconSVG(size);
  const filename = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`✓ Created icon${size}.svg`);
});

console.log('\n✨ All icons generated successfully!');
console.log('\nNote: Chrome extensions prefer PNG format.');
console.log('To convert SVG to PNG:');
console.log('1. Open src/icons/generate-icons.html in your browser');
console.log('2. Download all three PNG files');
console.log('3. Save them to src/icons/');

