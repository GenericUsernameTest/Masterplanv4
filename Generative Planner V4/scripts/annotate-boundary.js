const fs = require("fs");
const path = require("path");

const siteId = process.argv[2];
if (!siteId) throw new Error("Usage: npm run annotate <siteId>");

const DATA_DIR = path.join(__dirname, "../data");
const input = path.join(DATA_DIR, `${siteId}-analysis.json`);
const output = path.join(DATA_DIR, `${siteId}-response.json`);

const data = JSON.parse(fs.readFileSync(input, "utf8"));
const boundaries = data.boundary;

// --- simple "southern edge" logic:
let southIndex = 0;
let minLat = Infinity;
for (let i = 0; i < boundaries.length; i++) {
  const lat = boundaries[i][1];
  if (lat < minLat) {
    minLat = lat;
    southIndex = i;
  }
}

const annotated = {
  ...data,
  highlights: boundaries.map((b, i) =>
    i === southIndex ? { color: "red" } : { color: "none" }
  )
};

fs.writeFileSync(output, JSON.stringify(annotated, null, 2));
console.log(`✅ Wrote ${output}`);