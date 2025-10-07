#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

function findLatestAnalysis() {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('-analysis.json'))
    .map(f => ({
      file: f,
      full: path.join(DATA_DIR, f),
      mtime: fs.statSync(path.join(DATA_DIR, f)).mtimeMs
    }))
    .sort((a,b) => b.mtime - a.mtime);
  return files[0];
}

function extractSiteId(filename) {
  return filename.replace('-analysis.json','');
}

const latest = findLatestAnalysis();
if (!latest) {
  console.error('❌ No *-analysis.json files found in data directory.');
  process.exit(1);
}

const siteId = extractSiteId(latest.file);
console.log(`🔍 Latest analysis: ${latest.file} (siteId=${siteId})`);

// Reuse annotate logic inline (avoid requiring original script to keep it simple)
const data = JSON.parse(fs.readFileSync(latest.full, 'utf8'));

// Support both legacy array boundary and new object with geometry
let boundaryCoords = [];
if (Array.isArray(data.boundary)) {
  boundaryCoords = data.boundary; // legacy format
} else if (data.boundary && data.boundary.geometry && Array.isArray(data.boundary.geometry.coordinates)) {
  // Expect Polygon coordinates[0] as outer ring
  const coords = data.boundary.geometry.coordinates;
  if (coords.length > 0 && Array.isArray(coords[0])) {
    boundaryCoords = coords[0];
  }
}

if (!Array.isArray(boundaryCoords) || boundaryCoords.length === 0) {
  console.error('⚠️ Boundary missing or empty in latest analysis file (unsupported format).');
  process.exit(1);
}

let southIndex = 0;
let minLat = Infinity;
for (let i = 0; i < boundaryCoords.length; i++) {
  const lat = boundaryCoords[i][1];
  if (lat < minLat) { minLat = lat; southIndex = i; }
}

const annotated = {
  ...data,
  siteId,
  highlights: boundaryCoords.map((_, i) => i === southIndex ? { color: 'red' } : { color: 'none' })
};

const output = path.join(DATA_DIR, `${siteId}-response.json`);
fs.writeFileSync(output, JSON.stringify(annotated, null, 2));
console.log(`✅ Updated latest site response: ${path.basename(output)}`);

// Analysis complete - ready for AI processing
console.log('🤖 Ready for AI analysis step');
console.log(`👉 Run AI analysis: node scripts/ai-task1.js data/${siteId}-analysis.json data/${siteId}-response.json`);