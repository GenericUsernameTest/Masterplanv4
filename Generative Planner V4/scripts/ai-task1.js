// ai-task1.js - AI Response Generator (CommonJS)
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

// 🔑 Create OpenAI client using your environment key
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Get file path from command-line arguments
const analysisPath = process.argv[2];

if (!analysisPath) {
  console.error('❌ Usage: node ai-task1.js <analysisPath>');
  console.error('❌ Example: node ai-task1.js data/site-123456789-analysis.json');
  process.exit(1);
}

// Generate response file path based on analysis file path
const responsePath = analysisPath.replace('-analysis.json', '-response.json');

try {
  // Read and parse the existing analysis file
  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  console.log(`🤖 Generating AI response for site: ${analysis.siteId}`);
  
  // Extract data from the analysis file (already created when site boundary was drawn)
  const edges = analysis.edges || [];
  const boundary = analysis.boundary?.geometry?.coordinates?.[0] || analysis.boundary || [];

  console.log(`📊 Analyzing ${edges.length} edges for AI recommendations...`);

  // Calculate edge properties for AI analysis (using 'from' and 'to')
  const edgeAnalysis = edges.map((edge, index) => {
    const start = edge.from;
    const end = edge.to;
    if (Array.isArray(start) && Array.isArray(end)) {
      const length = Math.sqrt(
        Math.pow(end[0] - start[0], 2) + Math.pow(end[1] - start[1], 2)
      );
      const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      
      // Calculate bearing (degrees from north, clockwise) with proper spherical calculation
      const dLon = end[0] - start[0];
      const dLat = end[1] - start[1];
      
      // Account for latitude distortion in longitude measurements
      const avgLat = (start[1] + end[1]) / 2;
      const dLonCorrected = dLon * Math.cos(avgLat * Math.PI / 180);
      
      // Calculate bearing: atan2(east component, north component)
      const bearing = Math.atan2(dLonCorrected, dLat) * 180 / Math.PI;
      
      return {
        index,
        id: edge.id || `edge_${index}`,
        length: edge.length || length,
        midpoint,
        orientation: calculateOrientation(start, end),
        bearing: (bearing + 360) % 360, // normalize 0-360
        accessibility: assessAccessibility(midpoint, edge.length || length)
      };
    }
    return { index, id: edge.id || `edge_${index}`, length: 0, accessibility: 0 };
  });
  
  // Generate AI-driven recommendations based on the analysis
  const recommendations = generateRecommendations(edgeAnalysis, analysis);

  // Build AI response object (analysis file already exists, this creates the response)
  const response = {
    siteId: analysis.siteId,
    analysisFile: path.basename(analysisPath),
    responseFile: path.basename(responsePath),
    timestamp: new Date().toISOString(),
    recommendations,
    aiAnalysis: {
      edgeAnalysis,
      primaryAccessEdge: recommendations.find(r => r.action === "create_access")?.edgeId || "edge_0",
      highlightedEdges: recommendations.filter(r => r.action === "highlight_edge").map(r => r.edgeId),
      summary: `🤖 AI analyzed ${edges.length} edges, recommended ${recommendations.length} actions`,
      generatedBy: "ai-task1.js (AI Response Generator)"
    }
  };

  fs.writeFileSync(responsePath, JSON.stringify(response, null, 2), 'utf8');
  console.log(`✅ AI response saved to ${responsePath}`);
  console.log(`🎯 Generated ${recommendations.length} recommendations for ${analysis.siteId}`);
  
} catch (error) {
  console.error('❌ AI response generation failed:', error);
  
  // Create minimal error response
  const siteId = analysisPath ? path.basename(analysisPath).replace('-analysis.json', '') : 'unknown';
  const errorResponse = {
    siteId,
    analysisFile: path.basename(analysisPath),
    responseFile: path.basename(responsePath),
    timestamp: new Date().toISOString(),
    recommendations: [{
      action: "highlight_edge",
      edgeIndex: 0,
      color: "red",
      reasoning: "❌ AI analysis failed - highlighting first edge as fallback"
    }],
    aiAnalysis: {
      error: error.message,
      summary: "🚫 AI response generation failed, using fallback recommendations",
      generatedBy: "ai-task1.js (Error Fallback)"
    }
  };
  
  fs.writeFileSync(responsePath, JSON.stringify(errorResponse, null, 2), 'utf8');
  console.log(`⚠️ Error response saved to ${responsePath}`);
  process.exit(1);
}

// Helper functions for AI analysis
function calculateOrientation(start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  
  if (angle >= -45 && angle < 45) return "east";
  if (angle >= 45 && angle < 135) return "north";
  if (angle >= 135 || angle < -135) return "west";
  return "south";
}

function assessAccessibility(midpoint, length) {
  // Simple accessibility scoring (enhance with VS Code AI)
  // Longer edges generally better for access
  // South/east facing often preferred for visibility
  const lengthScore = Math.min(length * 1000, 100); // Normalize length
  const latitudeScore = Math.max(0, 50 - Math.abs(midpoint[1]) * 10); // Prefer mid-latitudes
  
  return Math.round((lengthScore + latitudeScore) / 2);
}

function generateRecommendations(edgeAnalysis, analysis) {
  // Sort edges by accessibility score
  const sortedEdges = [...edgeAnalysis].sort((a, b) => b.accessibility - a.accessibility);
  
  const recommendations = [];
  
  // Recommend primary access on best edge
  if (sortedEdges.length > 0) {
    recommendations.push({
      action: "create_access",
      edgeId: sortedEdges[0].id,
      edgeIndex: sortedEdges[0].index,
      reasoning: `Best access point: ${sortedEdges[0].orientation}-facing edge with high accessibility score (${sortedEdges[0].accessibility})`
    });
    
    recommendations.push({
      action: "highlight_edge",
      edgeId: sortedEdges[0].id,
      edgeIndex: sortedEdges[0].index,
      color: "#ff2222",
      reasoning: `Primary recommendation: optimal for vehicle and pedestrian access`
    });
  }
  
  // Highlight secondary option if available
  if (sortedEdges.length > 1 && sortedEdges[1].accessibility > 30) {
    recommendations.push({
      action: "highlight_edge", 
      edgeId: sortedEdges[1].id,
      edgeIndex: sortedEdges[1].index,
      color: "#ff8800",
      reasoning: `Secondary option: ${sortedEdges[1].orientation}-facing alternative access`
    });
  }
  
  return recommendations;
}

