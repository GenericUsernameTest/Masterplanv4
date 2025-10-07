// scripts/ai-place-block.js
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function run(siteId, blockName) {
  const dataDir = path.join(__dirname, "../data");
  const componentsDir = path.join(__dirname, "../components/blocks");

  const analysis = JSON.parse(fs.readFileSync(`${dataDir}/${siteId}-analysis.json`, "utf8"));
  const response = JSON.parse(fs.readFileSync(`${dataDir}/${siteId}-response.json`, "utf8"));
  const block = JSON.parse(fs.readFileSync(`${componentsDir}/${blockName}.geojson`, "utf8"));

  const prompt = `
You are an AI site planner.
The site boundary is a polygon with coordinates.
The AI response identifies which boundary edge is the optimal access point.
Position the given block geometry so its base edge aligns and orients to that boundary edge.
Output a new GeoJSON object with transformed coordinates.

SITE DATA:
${JSON.stringify(analysis)}

AI RESPONSE:
${JSON.stringify(response)}

BLOCK DATA:
${JSON.stringify(block)}
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  const aiGeojson = completion.choices[0].message.content;
  const outPath = `${dataDir}/${siteId}-${blockName}-placed.geojson`;
  fs.writeFileSync(outPath, aiGeojson);
  console.log(`✅ Block ${blockName} placed for ${siteId}: ${outPath}`);
}

const [,, siteId, blockName] = process.argv;
run(siteId, blockName);