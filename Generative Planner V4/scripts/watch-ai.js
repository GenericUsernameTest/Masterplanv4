// scripts/watch-ai.js
const chokidar = require("chokidar");
const path = require("path");
const { execSync } = require("child_process");

const DATA_DIR = path.join(__dirname, "../data");

console.log("🤖 Watching for new or updated analysis files in:", DATA_DIR);

const watcher = chokidar.watch(`${DATA_DIR}/*-analysis.json`, {
  persistent: true,
  ignoreInitial: false,
  usePolling: true,
  interval: 500
});

watcher.on("add", runAI);
watcher.on("change", runAI);

function runAI(filePath) {
  const siteId = path.basename(filePath).replace("-analysis.json", "");
  const responseFile = path.join(DATA_DIR, `${siteId}-response.json`);

  console.log(`\n🧠 AI task triggered for: ${path.basename(filePath)}`);

  try {
    // Run the AI task directly
    execSync(`node scripts/ai-task1.js ${filePath} ${responseFile}`, {
      stdio: "inherit"
    });
    console.log(`✅ AI response generated: ${path.basename(responseFile)}\n`);
  } catch (err) {
    console.error("❌ AI generation failed:", err.message);
  }
}