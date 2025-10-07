const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");

const app = express();
const PORT = 4000;
const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use("/data", express.static(DATA_DIR));

// ✅ Health check
app.get("/ping", (req, res) => res.send("✅ Data server running"));

// ✅ Generate new site ID
app.get("/new-site", (req, res) => {
  const id = `site-${Date.now()}`;
  const file = path.join(DATA_DIR, `${id}-analysis.json`);
  fs.writeFileSync(file, JSON.stringify({ created: new Date().toISOString(), boundary: [] }, null, 2));
  res.json({ siteId: id });
});

// ✅ Save boundary analysis
app.post("/save-analysis", (req, res) => {
  const { siteId, areaHa, boundary, timestamp, edges, area } = req.body || {};
  if (!siteId || !boundary) return res.status(400).json({ error: "Missing siteId or boundary" });

  const analysisData = {
    siteId, // include siteId so AI script can use it
    areaHa: areaHa || 0, // Real-world area in square meters
    boundary,
    timestamp: timestamp || Date.now(),
    edges: edges || [],
    area: area || 0 // Legacy coordinate-based area
  };

  const file = path.join(DATA_DIR, `${siteId}-analysis.json`);
  fs.writeFileSync(file, JSON.stringify(analysisData, null, 2));
  console.log(`💾 Saved analysis for ${siteId} with area: ${areaHa} m²`);
  res.json({ success: true });
});

// ✅ List all analysis files
app.get('/analyses', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('-analysis.json'))
      .map(f => {
        const full = path.join(DATA_DIR, f);
        const stat = fs.statSync(full);
        return { file: f, mtime: stat.mtimeMs };
      })
      .sort((a,b) => b.mtime - a.mtime);
    res.json({ count: files.length, files });
  } catch (err) {
    console.error('❌ Failed to list analyses', err);
    res.status(500).json({ error: 'Failed to list analyses', details: err.message });
  }
});

// ✅ Site status (analysis / response existence) – used by UI for diagnostics
app.get('/site-status/:siteId', (req, res) => {
  const { siteId } = req.params;
  if (!siteId) return res.status(400).json({ error: 'Missing siteId' });
  const analysisPath = path.join(DATA_DIR, `${siteId}-analysis.json`);
  const responsePath = path.join(DATA_DIR, `${siteId}-response.json`);
  const status = {
    siteId,
    hasAnalysis: fs.existsSync(analysisPath),
    hasResponse: fs.existsSync(responsePath),
    analysisPath,
    responsePath
  };
  res.json(status);
});

// ✅ Run AI task
app.post("/run-ai-task1/:siteId", (req, res) => {
  const { siteId } = req.params;
  const input = path.join(DATA_DIR, `${siteId}-analysis.json`);
  const output = path.join(DATA_DIR, `${siteId}-response.json`);

  if (!fs.existsSync(input)) {
    console.error(`❌ Analysis file not found for ${siteId}: ${input}`);
    return res.status(404).json({ error: "Analysis file not found" });
  }

  console.log(`🤖 Running AI response generator for ${siteId}...`);
  console.log(`📄 Input: ${input}`);
  console.log(`📄 Expected output: ${output}`);
  
  // Updated: ai-task1.js now only takes input parameter and generates output path automatically
  const cmd = `node scripts/ai-task1.js "${input}"`;
  exec(cmd, (err, stdout, stderr) => {
    if (stdout) console.log(stdout.trim());
    if (stderr) console.warn('[ai-task1 stderr]', stderr.trim());
    if (err) {
      console.error(`❌ AI response generation failed for ${siteId}:`, err.message);
      return res.status(500).json({ error: "AI response generation failed", details: err.message });
    }
    const exists = fs.existsSync(output);
    console.log(`✅ AI response ${exists ? 'generated' : 'missing'} at ${output}`);
    res.json({ success: true, input, output, exists });
  });
});

// ✅ Upload AI response file
app.post("/upload-ai-response/:siteId", (req, res) => {
  const { siteId } = req.params;
  const responseData = req.body;
  
  if (!responseData) {
    return res.status(400).json({ error: "Missing response data" });
  }

  const file = path.join(DATA_DIR, `${siteId}-response.json`);
  fs.writeFileSync(file, JSON.stringify(responseData, null, 2));
  console.log(`📤 Uploaded AI response for ${siteId}`);
  res.json({ success: true, message: "AI response uploaded successfully" });
});

// ✅ Serve frontend for everything else
app.get(/^\/(?!data).*/, (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.listen(PORT, () => {
  console.log(`🚀 Data server running at http://127.0.0.1:${PORT}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
});