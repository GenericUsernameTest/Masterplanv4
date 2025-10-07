/**
 * Main application initialization
 * Handles map setup, UI initialization, and core functionality
 */

// Block placement system
let loadedBlocks = {};
let activeBlockType = null;
let blockPlacementMode = false;
let blockPreviewSourceId = null;

/**
 * Quick server availability probe (non-blocking)
 */
async function probeDataServer() {
  const apiBase = 'http://127.0.0.1:4000';
  try {
    const res = await fetch(`${apiBase}/ping`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    console.log('🩺 Data server reachable.');
    return true;
  } catch (err) {
    console.warn('⚠️ Data server not reachable:', err.message);
    if (typeof showNotification === 'function') {
      showNotification('⚠️ Data server not running', 'Start it with: node data-server.js\nSaving to /data will fallback to local downloads.', 'error');
    }
    return false;
  }
}

// Fire probe shortly after load (non-blocking)
setTimeout(() => { probeDataServer(); }, 800);

/**
 * AI Analysis System - Capture site boundary for AI decision making
 */

// URL-based Site ID Management
function getSiteIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('site');
}

function generateSiteId() {
  return `site-${Date.now()}`;
}

function getCurrentSiteId() {
  // Priority: URL parameter > localStorage > generate new
  let siteId = getSiteIdFromUrl();
  if (!siteId) {
    siteId = localStorage.getItem('currentSiteId');
  }
  if (!siteId) {
    siteId = generateSiteId();
    localStorage.setItem('currentSiteId', siteId);
    // Update URL with new site ID
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('site', siteId);
    window.history.replaceState({}, '', newUrl);
  }
  return siteId;
}

function updateSiteIdDisplay() {
  const siteId = getCurrentSiteId();
  const siteIdElement = document.getElementById('current-site-id');
  if (siteIdElement) {
    siteIdElement.textContent = siteId;
  }
}



/**
 * Calculate edges from boundary coordinates
 */
function calculateEdges(boundary) {
  const edges = [];
  for (let i = 0; i < boundary.length - 1; i++) {
    edges.push({
      from: boundary[i],
      to: boundary[i + 1],
      length: calculateDistance(boundary[i], boundary[i + 1])
    });
  }
  return edges;
}

/**
 * Show or hide the block placement panel
 */
function toggleBlockPanel(show) {
  const blockPanel = document.getElementById('block-placement-panel');
  if (blockPanel) {
    blockPanel.style.display = show ? 'block' : 'none';
    console.log(`${show ? '✅' : '❌'} Block placement panel ${show ? 'shown' : 'hidden'}`);
  } else {
    console.log('❌ Block placement panel not found!');
  }
}

/**
 * Calculate distance between two coordinates
 */
function calculateDistance(coord1, coord2) {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Calculate real-world area in square meters using Turf.js
 */
function calculateRealWorldArea(boundary) {
  try {
    // Create a proper GeoJSON polygon for Turf.js
    const polygon = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [boundary]
      }
    };
    
    // Calculate area in square meters using Turf.js
    const areaSquareMeters = turf.area(polygon);
    
    console.log(`📐 Real-world area: ${areaSquareMeters.toFixed(2)} m² (${(areaSquareMeters/10000).toFixed(4)} ha)`);
    
    return Math.round(areaSquareMeters);
  } catch (error) {
    console.error('❌ Error calculating real-world area:', error);
    return 0;
  }
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(boundary) {
  let area = 0;
  const n = boundary.length;
  
  for (let i = 0; i < n - 1; i++) {
    area += boundary[i][0] * boundary[i + 1][1];
    area -= boundary[i + 1][0] * boundary[i][1];
  }
  
  return Math.abs(area) / 2;
}

/**
 * Export site analysis directly to /data folder using URL site ID
 */
function exportSiteAnalysisToDataFolder(boundary, siteId) {
  console.log("📐 Exporting boundary for AI:", boundary);
  if (!Array.isArray(boundary) || boundary.length < 3) {
    const err = new Error('Invalid boundary passed to exportSiteAnalysisToDataFolder');
    console.error('❌', err.message, boundary);
    return Promise.reject(err);
  }
  if (!siteId) {
    siteId = getCurrentSiteId();
  }

  const payload = {
    siteId,
    areaHa: calculateRealWorldArea(boundary), // Area in square meters (hectares * 10000)
    boundary: {
      geometry: {
        type: "Polygon",
        coordinates: [boundary]
      }
    },
    timestamp: Date.now(),
    edges: calculateEdges(boundary),
    area: calculatePolygonArea(boundary) // Legacy coordinate-based area
  };

  // Determine API base dynamically so it works in Codespaces/containers or when proxied
  const isGitHubPages = /github\.io$/i.test(window.location.hostname);
  // Allow API base override via ?apiBase=... and persist in localStorage
  try {
    const urlApiBase = new URLSearchParams(window.location.search).get('apiBase');
    if (urlApiBase) {
      localStorage.setItem('API_BASE_OVERRIDE', urlApiBase);
      window.API_BASE = urlApiBase;
      console.log(`🔧 API_BASE override from URL param: ${urlApiBase}`);
    } else {
      const stored = localStorage.getItem('API_BASE_OVERRIDE');
      if (stored && !window.API_BASE) {
        window.API_BASE = stored;
        console.log(`🔧 API_BASE restored from localStorage: ${stored}`);
      }
    }
  } catch (e) { /* ignore */ }
  const explicitApiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : null;
  const apiBase = (function() {
    try {
      if (explicitApiBase) {
        return explicitApiBase.replace(/\/$/, '');
      }
      if (isGitHubPages) {
        return null; // Offline mode unless API_BASE supplied
      }
      // If site served from same origin & port (common when express serves frontend)
      if (window.location.port === '4000') {
        return window.location.origin;
      }
      // If running on a forwarded port (Codespaces style), still use origin
      if (window.location.hostname.includes('github.dev') || window.location.hostname.includes('app.github.dev')) {
        return window.location.origin.replace(/https?:\/\//,'https://');
      }
      // Default fallback to same host :4000
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    } catch (e) {
      return 'http://127.0.0.1:4000';
    }
  })();
  if (!apiBase) {
    console.log('🌐 Offline mode (no API_BASE) detected: creating downloadable analysis only.');
    // Provide downloadable file immediately
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${siteId}-analysis.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showNotification === 'function') {
      showNotification('📁 Analysis Generated', 'Downloaded locally (offline mode)', 'info');
    }
    return Promise.resolve({ offline: true, siteId });
  }
  console.log(`📡 Posting analysis to ${apiBase}/save-analysis for ${siteId}`);
  return fetch(`${apiBase}/save-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(async res => {
    const txt = await res.text().catch(() => '');
    if (!res.ok) {
      const errDetail = txt || res.statusText;
      console.error('❌ Save analysis failed:', res.status, errDetail);
      throw new Error(`Save failed (${res.status}) ${errDetail}`);
    }
    console.log('💾 Saved analysis for site:', siteId);
    if (typeof showNotification === 'function') {
      showNotification('📁 Analysis Saved', `Site analysis saved for ${siteId}`, 'success');
    }
    try { return JSON.parse(txt || '{}'); } catch { return {}; }
  }).catch(err => {
    // Fallback: still provide a local download so user has the file
    console.warn('⚠️ Server unreachable, falling back to local download only:', err.message);
    try {
      const fileName = `${payload.siteId}-analysis.json`;
      const jsonContent = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log('💾 Offline analysis file offered for download:', fileName);
      if (typeof showNotification === 'function') {
        showNotification('📁 Analysis Saved (Local Only)', 'Server not reachable; file downloaded instead.', 'info');
      }
      return { offline: true };
    } catch (fallbackErr) {
      console.error('❌ Local fallback failed:', fallbackErr);
      if (typeof showNotification === 'function') {
        showNotification('❌ Save Failed', 'Could not save analysis (server + local fallback failed)', 'error');
      }
      throw err; // rethrow original
    }
  });
}

// Helper: fetch and log existing analyses (debug utility)
async function listExistingAnalyses() {
  try {
    const base = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':'+window.location.port : ''}`;
    const candidates = [base, `${window.location.protocol}//${window.location.hostname}:4000`];
    for (const origin of candidates) {
      try {
        const r = await fetch(`${origin}/analyses`);
        if (r.ok) {
          const data = await r.json();
          console.log(`📄 Analyses from ${origin}:`, data);
          return data;
        }
      } catch {/* try next */}
    }
  } catch (err) {
    console.warn('⚠️ Could not list analyses', err);
  }
  return null;
}

// 🔹 Export boundary (if needed before AI runs)
function exportSiteBoundaryForAI() {
  if (!window.siteBoundary) {
    console.log('❌ No site boundary to analyze');
    alert('Please draw a site boundary first');
    return null;
  }

  const coords = window.siteBoundary.geometry.coordinates[0];
  console.log("📐 Exporting boundary for AI:", coords);
  return coords;
}


// Check site status in data folder
async function checkSiteStatus() {
  const siteId = getCurrentSiteId();
  try {
    const response = await fetch(`http://localhost:4000/site-status/${siteId}`);
    if (response.ok) {
      const status = await response.json();
      console.log(`📊 Site status for ${siteId}:`, status);
      
      let message = `Site: ${siteId}\n`;
      message += status.hasAnalysis ? `✅ Analysis file exists\n` : `❌ No analysis file\n`;
      message += status.hasResponse ? `✅ Response file exists` : `❌ No response file`;
      
      showNotification(
        '📊 Data Folder Status',
        message,
        status.hasAnalysis ? 'success' : 'info'
      );
    } else {
      throw new Error('Status check failed');
    }
  } catch (error) {
    console.error('❌ Status check error:', error);
    showNotification(
      '❌ Status Check Failed',
      'Could not check data folder status.\nPlease ensure data server is running.',
      'error'
    );
  }
}

function getCardinalDirection(bearing) {
  const normalized = ((bearing % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return 'North';
  if (normalized >= 22.5 && normalized < 67.5) return 'Northeast';
  if (normalized >= 67.5 && normalized < 112.5) return 'East';
  if (normalized >= 112.5 && normalized < 157.5) return 'Southeast';
  if (normalized >= 157.5 && normalized < 202.5) return 'South';
  if (normalized >= 202.5 && normalized < 247.5) return 'Southwest';
  if (normalized >= 247.5 && normalized < 292.5) return 'West';
  if (normalized >= 292.5 && normalized < 337.5) return 'Northwest';
}

/**
 * AI Decision Interface - Modern file-based system with proper site ID management
 */
function requestAIPlacement(blockType, instructions = '') {
  const siteData = exportSiteBoundaryForAI();
  if (!siteData) return;
  
  // Generate or use existing site ID
  const siteId = window.currentSiteId || `site-${Date.now()}`;
  window.currentSiteId = siteId;
  
  console.log('🤖 AI Placement Request for Site ID:', siteId, {
    block: blockType,
    instructions: instructions,
    site: siteData
  });
  
  // Create comprehensive AI analysis file with site ID
  const aiAnalysisData = {
    siteId: siteId,
    timestamp: new Date().toISOString(),
    version: "1.0",
    request: {
      blockType: blockType,
      instructions: instructions,
      userIntent: `Place ${blockType} ${instructions}`
    },
    siteAnalysis: siteData,
    context: {
      availableBlocks: Object.keys(loadedBlocks),
      currentMapView: window.map ? {
        center: window.map.getCenter(),
        zoom: window.map.getZoom(),
        bearing: window.map.getBearing()
      } : null,
      siteName: document.querySelector('#site-name-nav span')?.textContent || 'Untitled Site'
    },
    aiGuidance: {
      expectedResponse: {
        siteId: siteId,
        placementCoordinates: "[longitude, latitude]",
        rotationAngle: "degrees (0-360)",
        confidence: "percentage (0-100)",
        reasoning: "explanation of placement decision",
        alternatives: "optional alternative positions"
      },
      constraints: [
        "Must be within site boundary",
        "Consider solar orientation and prevailing winds", 
        "Optimize for traffic flow and accessibility",
        "Respect setbacks from boundaries",
        "Consider existing infrastructure"
      ],
      responseFileName: `${siteId}-ai-response.json`
    }
  };
  
  // Save to data folder with site ID
  saveAIAnalysisToDataFolder(aiAnalysisData);
  
  return aiAnalysisData;
}

/**
 * Save AI analysis to data folder with proper site ID naming
 */
function saveAIAnalysisToDataFolder(analysisData) {
  const fileName = `${analysisData.siteId}-analysis.json`;
  
  // Create beautiful formatted JSON
  const jsonContent = JSON.stringify(analysisData, null, 2);
  
  // Create download link to save in data folder
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  // Auto-download the file
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  console.log('💾 Site analysis saved to data folder:', fileName);
  
  // Also save to browser storage
  localStorage.setItem(`siteAnalysis_${analysisData.siteId}`, jsonContent);
  localStorage.setItem('currentSiteId', analysisData.siteId);
  
  // Show notification with file instructions
  showNotification(
    '📁 Site Analysis Generated', 
    `File: ${fileName}\n\nSave this file to your /data folder, then have AI create: ${analysisData.aiGuidance.responseFileName}`, 
    'success'
  );
}

/**
 * Load site analysis from data folder (for development/testing)
 */
function loadSiteAnalysis(siteId) {
  // Try to load from localStorage first
  const stored = localStorage.getItem(`siteAnalysis_${siteId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to parse stored site analysis');
    }
  }
  return null;
}

/**
 * Handle AI response file upload
 */
async function handleAIResponseFile(input) {
  const file = input.files[0];
  if (!file) return;
  
  if (!file.name.endsWith('.json')) {
    showNotification('❌ Invalid File', 'Please upload a JSON file', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const responseData = JSON.parse(e.target.result);
      console.log('📁 AI response file loaded:', responseData);
      
      // Get current site ID
      const siteId = getCurrentSiteId();
      
      // Upload to server first
      if (siteId) {
        try {
          const uploadResponse = await fetch(`${apiBase}/upload-ai-response/${siteId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(responseData)
          });
          
          if (uploadResponse.ok) {
            console.log('✅ AI response uploaded to server');
            showNotification('📤 Response Uploaded', 'AI response saved to data folder', 'info');
          } else {
            console.warn('⚠️ Failed to upload AI response to server');
          }
        } catch (uploadError) {
          console.error('❌ Upload error:', uploadError);
        }
      }
      
      // Process the AI response
      const success = processAIResponse(responseData);
      
      if (success) {
        showNotification('🎉 AI Response Processed', 'Block placement executed successfully!', 'success');
        // Additional inline placement preview using direct turf transforms (independent of placeBlockAtLocation)
        try {
          const aiData = responseData;
            if (typeof turf !== 'undefined' && aiData.blockType && aiData.placementCoordinates) {
              const [lng, lat] = aiData.placementCoordinates;
              const rotation = aiData.rotationAngle || 0;
              const inset = aiData.insetOffsetMeters || 0;
              console.log(`🧱 (Inline) Secondary placement render for ${aiData.blockType} at`, lng, lat, 'rotation', rotation, 'inset', inset);
              fetch(`components/blocks/${aiData.blockType}.geojson`)
                .then(r => r.json())
                .then(block => {
                  // Rotate around pivot
                  let transformed = turf.transformRotate(block, rotation, { pivot: [lng, lat] });
                  if (inset) {
                    transformed = turf.transformTranslate(transformed, inset, 0, { units: 'meters' });
                  }
                  const srcId = `${aiData.blockType}-inline-preview`;
                  // Clean existing
                  if (map.getSource(srcId)) {
                    try { map.removeLayer(srcId); } catch(_) {}
                    try { map.removeSource(srcId); } catch(_) {}
                  }
                  map.addSource(srcId, { type: 'geojson', data: transformed });
                  // Detect if any Polygon/MultiPolygon exists
                  const hasPolygon = transformed.features && transformed.features.some(f => ['Polygon','MultiPolygon'].includes(f.geometry.type));
                  if (hasPolygon) {
                    map.addLayer({
                      id: srcId,
                      type: 'fill',
                      source: srcId,
                      paint: { 'fill-color': '#ff4444', 'fill-opacity': 0.4 }
                    });
                  } else {
                    map.addLayer({
                      id: srcId,
                      type: 'line',
                      source: srcId,
                      paint: {
                        'line-color': '#ff4444',
                        'line-width': 4,
                        'line-opacity': 0.85
                      }
                    });
                  }
                  console.log('✅ Inline preview layer added:', srcId, hasPolygon ? '(fill)' : '(line)');
                })
                .catch(err => console.warn('⚠️ Inline fetch/transform failed:', err.message));
            }
        } catch (inlineErr) {
          console.warn('⚠️ Inline placement error:', inlineErr.message);
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse AI response:', error);
      showNotification('❌ File Error', 'Could not parse AI response file', 'error');
    }
  };
  
  reader.readAsText(file);
  
  // Clear the input so the same file can be uploaded again
  input.value = '';
}

/**
 * Process AI response from file
 */
function processAIResponse(responseData) {
  try {
    // Validate site ID matches current site
    if (responseData.siteId && window.currentSiteId && responseData.siteId !== window.currentSiteId) {
      const proceed = confirm(`AI response is for site ${responseData.siteId}, but current site is ${window.currentSiteId}. Continue anyway?`);
      if (!proceed) return false;
    }
    
    if (responseData.placementCoordinates && responseData.rotationAngle !== undefined) {
      const [lng, lat] = responseData.placementCoordinates;
      
      // Store rotation for placement
      window.blockRotationAngle = responseData.rotationAngle;
      
      // Set active block and place it
      activeBlockType = responseData.blockType || 'Block3';
      placeBlockAtLocation({ lng, lat });
      
      // Clear rotation after placement
      window.blockRotationAngle = null;
      
      // Update site data with AI response
      if (responseData.siteId) {
        const analysisKey = `siteAnalysis_${responseData.siteId}`;
        const existingAnalysis = localStorage.getItem(analysisKey);
        if (existingAnalysis) {
          try {
            const analysis = JSON.parse(existingAnalysis);
            analysis.aiResponse = {
              timestamp: new Date().toISOString(),
              ...responseData
            };
            localStorage.setItem(analysisKey, JSON.stringify(analysis, null, 2));
          } catch (e) {
            console.warn('Could not update site analysis with AI response');
          }
        }
      }
      
      console.log('🎯 AI placement executed for site:', responseData.siteId || 'unknown', responseData);
      showNotification(
        '🤖 AI Placement Complete', 
        `${responseData.reasoning || 'Block placed based on AI analysis'}\n\nSite: ${responseData.siteId || 'unknown'}`, 
        'success'
      );
      
      return true;
    } else {
      throw new Error('Invalid AI response format - missing placementCoordinates or rotationAngle');
    }
  } catch (error) {
    console.error('❌ AI response processing failed:', error);
    showNotification('❌ AI Response Error', `Could not process AI placement response: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Modern notification system
 */
function showNotification(title, message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `ai-notification ai-notification-${type}`;
  notification.innerHTML = `
    <div class="ai-notification-content">
      <div class="ai-notification-title">${title}</div>
      <div class="ai-notification-message">${message}</div>
    </div>
    <button class="ai-notification-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
  
  // Slide in animation
  setTimeout(() => {
    notification.classList.add('ai-notification-show');
  }, 10);
}

/**
 * Load block data from JSON files
 */
async function loadBlockData() {
  const blockTypes = ['Block1', 'Block2', 'Block3', 'Block4', 'Block5'];
  
  console.log('🔄 Starting to load block data...');
  
  for (const blockType of blockTypes) {
    try {
      const url = `components/blocks/${blockType}.geojson`;
      console.log(`📦 Attempting to load: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      loadedBlocks[blockType] = data;
      console.log(`✅ Successfully loaded ${blockType}:`, data.features?.length || 0, 'features');
    } catch (err) {
      console.error(`❌ Failed to load ${blockType}:`, err);
    }
  }
  
  // Expose globally for AI placement
  window.loadedBlocks = loadedBlocks;
  console.log('📋 Block loading complete. Loaded blocks:', Object.keys(loadedBlocks));
  
  // Reinitialize block buttons after all blocks are loaded
  console.log('🔄 Reinitializing block buttons after block data loaded...');
  initializeBlockButtons();
}

/**
 * Enter block placement mode
 */
function enterBlockPlacementMode(blockType) {
  console.log(`🎯 Attempting to enter placement mode for: ${blockType}`);
  console.log('📋 Available blocks:', Object.keys(loadedBlocks));
  
  if (!loadedBlocks[blockType]) {
    console.error('❌ Block type not loaded:', blockType);
    return;
  }
  
  // Disable draw tool to prevent interference
  try {
    console.log('🔧 Setting draw tool to simple_select mode');
    window.draw.changeMode('simple_select');
  } catch (err) {
    console.warn('Could not change draw mode:', err);
  }
  
  activeBlockType = blockType;
  blockPlacementMode = true;
  console.log('🔄 Block placement mode set to:', blockPlacementMode);
  
  // Add mouse move handler for block preview
  window.map.on('mousemove', showBlockPreview);
  window.map.on('mouseleave', hideBlockPreview);
  
  // Change cursor to indicate placement mode
  window.map.getCanvas().style.cursor = 'crosshair';
  
  console.log(`✅ Entered placement mode for ${blockType}`);
}

/**
 * Transform CAD block coordinates to geographic (reusable)
 */
function transformBlockToGeo(blockData, targetLng, targetLat, rotationDeg = 0) {
  if (!blockData || !blockData.features || blockData.features.length === 0) {
    console.warn('⚠️ Empty block data passed to transformBlockToGeo');
    return null;
  }

  const clonedData = JSON.parse(JSON.stringify(blockData));
  
  // Calculate bounding box from CAD coordinates
  const allCoords = [];
  clonedData.features.forEach(feature => {
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(coord => {
        allCoords.push([coord[0], coord[1]]);
      });
    }
  });

  if (allCoords.length === 0) return null;

  const minX = Math.min(...allCoords.map(c => c[0]));
  const maxX = Math.max(...allCoords.map(c => c[0]));
  const minY = Math.min(...allCoords.map(c => c[1]));
  const maxY = Math.max(...allCoords.map(c => c[1]));
  
  const originalWidth = maxX - minX;
  const originalHeight = maxY - minY;
  const originalCenterX = (minX + maxX) / 2;
  const originalCenterY = (minY + maxY) / 2;

  // Scale CAD units to meters (300m typical block)
  const targetSizeMeters = 300;
  const cadToMetersScale = targetSizeMeters / Math.max(originalWidth, originalHeight);
  
  // Conversion helpers
  const metersToLat = (m) => m / 111320;
  const metersToLng = (m, lat) => m / (111320 * Math.cos(lat * Math.PI / 180));
  
  // Convert geographic bearing (clockwise from north) to mathematical angle (counter-clockwise from east)
  // Geographic: 0°=N, 90°=E, 180°=S, 270°=W (clockwise)
  // Math: 0°=E, 90°=N, 180°=W, 270°=S (counter-clockwise)
  // Conversion: mathAngle = 90° - geoBearing
  const mathAngle = 90 - rotationDeg;
  const rotationRad = mathAngle * Math.PI / 180;
  
  console.log(`[Transform] Geographic bearing ${rotationDeg}° → Math angle ${mathAngle}° (${rotationRad} rad) at [${targetLng}, ${targetLat}]`);

  // Transform each feature
  clonedData.features.forEach(feature => {
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates = feature.geometry.coordinates.map(coord => {
        // Normalize to origin
        const normX = coord[0] - originalCenterX;
        const normY = coord[1] - originalCenterY;
        
        // Scale to meters
        const metersX = normX * cadToMetersScale;
        const metersY = normY * cadToMetersScale;
        
        // Apply rotation in meter space
        const rotX = metersX * Math.cos(rotationRad) - metersY * Math.sin(rotationRad);
        const rotY = metersX * Math.sin(rotationRad) + metersY * Math.cos(rotationRad);
        
        // Convert to degrees and offset to target location
        const degX = metersToLng(rotX, targetLat);
        const degY = metersToLat(rotY);
        
        return [targetLng + degX, targetLat + degY];
      });
    }
  });

  return clonedData;
}

/**
 * Exit block placement mode
 */
function exitBlockPlacementMode() {
  console.log('🚪 Exiting block placement mode');
  activeBlockType = null;
  blockPlacementMode = false;
  console.log('🔄 Block placement mode set to:', blockPlacementMode);
  window.map.getCanvas().style.cursor = '';
  
  // Remove mouse handlers
  window.map.off('mousemove', showBlockPreview);
  window.map.off('mouseleave', hideBlockPreview);
  
  // Clean up preview
  hideBlockPreview();
  
  // Ensure draw tool stays in simple_select mode
  try {
    console.log('🔧 Ensuring draw tool stays in simple_select mode');
    window.draw.changeMode('simple_select');
  } catch (err) {
    console.warn('Could not ensure simple_select mode:', err);
  }
  
  console.log('✅ Block placement mode exited');
}

/**
 * Place a block at the clicked location
 */
function placeBlockAtLocation(lngLat) {
  console.log('🏗️ placeBlockAtLocation called with:', lngLat);
  
  if (!activeBlockType || !loadedBlocks[activeBlockType]) {
    console.log('❌ No active block type or block not loaded');
    return;
  }
  
  // Check if click is within site boundary
  if (!window.siteBoundary) {
    console.log('❌ No site boundary defined');
    return;
  }
  
  console.log('✅ Site boundary exists, checking if click is within boundary...');
  
  const clickPoint = turf.point([lngLat.lng, lngLat.lat]);
  const boundaryPolygon = turf.polygon(window.siteBoundary.geometry.coordinates);
  
  if (!turf.booleanPointInPolygon(clickPoint, boundaryPolygon)) {
    console.log('❌ Click is outside boundary');
    return;
  }
  
  console.log('✅ Click is within boundary, placing block...');
  
  // Get the block data
  const blockData = JSON.parse(JSON.stringify(loadedBlocks[activeBlockType]));
  console.log('📦 Block data loaded:', blockData.features?.length, 'features');
  
  // Calculate the bounding box of the original block
  const allCoords = [];
  blockData.features.forEach(feature => {
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(coord => {
        allCoords.push([coord[0], coord[1]]); // Remove Z coordinate
      });
    }
  });
  
  if (allCoords.length === 0) {
    console.error('❌ No coordinates found in block data');
    return;
  }
  
  console.log('📍 Found', allCoords.length, 'coordinates');
  
  // Find bounding box of original block
  const minX = Math.min(...allCoords.map(coord => coord[0]));
  const maxX = Math.max(...allCoords.map(coord => coord[0]));
  const minY = Math.min(...allCoords.map(coord => coord[1]));
  const maxY = Math.max(...allCoords.map(coord => coord[1]));
  
  const originalWidth = maxX - minX;
  const originalHeight = maxY - minY;
  const originalCenterX = (minX + maxX) / 2;
  const originalCenterY = (minY + maxY) / 2;
  
  console.log('📏 Original block bounds:', { minX, maxX, minY, maxY, width: originalWidth, height: originalHeight });
  
  // Convert from CAD units to meters (assuming CAD units are roughly meters)
  const targetSizeMeters = 300; // 300 meters for typical block
  const cadToMetersScale = targetSizeMeters / Math.max(originalWidth, originalHeight);
  
  // Geographic conversion functions
  const metersToLat = (meters) => meters / 111320;
  const metersToLng = (meters, lat) => meters / (111320 * Math.cos(lat * Math.PI / 180));
  
  console.log('� Scale factor:', cadToMetersScale, 'target size:', targetSizeMeters, 'meters');
  
  // Optional rotation angle from AI response (degrees)
  const rotationDeg = typeof window.blockRotationAngle === 'number' ? window.blockRotationAngle : 0;
  const rotationRad = rotationDeg * Math.PI / 180;

  // Transform coordinates: normalize to origin, scale, rotate (if any), then offset
  blockData.features.forEach(feature => {
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates = feature.geometry.coordinates.map(coord => {
        // Normalize to origin
        const normalizedX = coord[0] - originalCenterX;
        const normalizedY = coord[1] - originalCenterY;

        // Scale from CAD units to meters
        const metersX = normalizedX * cadToMetersScale;
        const metersY = normalizedY * cadToMetersScale;

        // Apply rotation in meter space
        const rotX = metersX * Math.cos(rotationRad) - metersY * Math.sin(rotationRad);
        const rotY = metersX * Math.sin(rotationRad) + metersY * Math.cos(rotationRad);

        // Convert meters to geographic degrees (preserving aspect ratio)
        const degreeX = metersToLng(rotX, lngLat.lat);
        const degreeY = metersToLat(rotY);

        return [lngLat.lng + degreeX, lngLat.lat + degreeY];
      });
    }
  });
  
  console.log('🔄 Coordinates transformed and scaled');
  
  // Add to map
  const sourceId = `placed-block-${Date.now()}`;
  
  try {
    window.map.addSource(sourceId, {
      type: 'geojson',
      data: blockData
    });
    console.log('✅ Source added:', sourceId);
  } catch (err) {
    console.error('❌ Error adding source:', err);
    return;
  }
  
  try {
    // Add primary roads layer
    window.map.addLayer({
      id: `${sourceId}-primary`,
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'Layer'], 'ROAD_PRIMARY'],
      paint: {
        'line-color': '#ff6600',
        'line-width': {
          "base": 1,
          "stops": [[0, 6], [22, 6]]
        }
      }
    });
    console.log('✅ Primary roads layer added');
  } catch (err) {
    console.error('❌ Error adding primary roads layer:', err);
  }
  
  try {
    // Add secondary roads layer
    window.map.addLayer({
      id: `${sourceId}-secondary`,
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'Layer'], 'ROAD_SECONDARY'],
      paint: {
        'line-color': '#ffaa00',
        'line-width': {
          "base": 1,
          "stops": [[0, 6], [22, 6]]
        }
      }
    });
    console.log('✅ Secondary roads layer added');
  } catch (err) {
    console.error('❌ Error adding secondary roads layer:', err);
  }
  
  console.log('🎉 Block placement complete, exiting placement mode...');
  
  // Exit placement mode
  exitBlockPlacementMode();
}

/**
 * Show block preview at mouse position
 */
function showBlockPreview(e) {
  if (!blockPlacementMode || !activeBlockType || !loadedBlocks[activeBlockType]) {
    return;
  }
  
  // Check if mouse is within site boundary
  if (!window.siteBoundary) {
    return;
  }
  
  const mousePoint = turf.point([e.lngLat.lng, e.lngLat.lat]);
  const boundaryPolygon = turf.polygon(window.siteBoundary.geometry.coordinates);
  
  if (!turf.booleanPointInPolygon(mousePoint, boundaryPolygon)) {
    hideBlockPreview();
    return;
  }
  
  // Get the block data for preview
  const blockData = JSON.parse(JSON.stringify(loadedBlocks[activeBlockType]));
  
  // Calculate the bounding box of the original block (same as placement function)
  const allCoords = [];
  blockData.features.forEach(feature => {
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(coord => {
        allCoords.push([coord[0], coord[1]]); // Remove Z coordinate
      });
    }
  });
  
  if (allCoords.length === 0) {
    return;
  }
  
  // Find bounding box and calculate scale factor (same as placement function)
  const minX = Math.min(...allCoords.map(coord => coord[0]));
  const maxX = Math.max(...allCoords.map(coord => coord[0]));
  const minY = Math.min(...allCoords.map(coord => coord[1]));
  const maxY = Math.max(...allCoords.map(coord => coord[1]));
  
  const originalWidth = maxX - minX;
  const originalHeight = maxY - minY;
  const originalCenterX = (minX + maxX) / 2;
  const originalCenterY = (minY + maxY) / 2;
  
  // Convert from CAD units to meters (assuming CAD units are roughly meters)
  const targetSizeMeters = 300; // 300 meters for typical block
  const cadToMetersScale = targetSizeMeters / Math.max(originalWidth, originalHeight);
  
  // Geographic conversion functions
  const metersToLat = (meters) => meters / 111320;
  const metersToLng = (meters, lat) => meters / (111320 * Math.cos(lat * Math.PI / 180));
  
  // Transform coordinates: normalize, scale to meters, then convert to geographic
  blockData.features.forEach(feature => {
    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates = feature.geometry.coordinates.map(coord => {
        // Normalize to origin
        const normalizedX = coord[0] - originalCenterX;
        const normalizedY = coord[1] - originalCenterY;
        
        // Scale from CAD units to meters
        const metersX = normalizedX * cadToMetersScale;
        const metersY = normalizedY * cadToMetersScale;
        
        // Convert meters to geographic degrees (preserving aspect ratio)
        const degreeX = metersToLng(metersX, e.lngLat.lat);
        const degreeY = metersToLat(metersY);
        
        // Offset to mouse location
        return [
          e.lngLat.lng + degreeX,
          e.lngLat.lat + degreeY
        ];
      });
    }
  });
  
  // Remove existing preview
  hideBlockPreview();
  
  // Add preview to map
  blockPreviewSourceId = `block-preview-${Date.now()}`;
  
  window.map.addSource(blockPreviewSourceId, {
    type: 'geojson',
    data: blockData
  });
  
  // Add preview layers with semi-transparent styling
  window.map.addLayer({
    id: `${blockPreviewSourceId}-primary`,
    type: 'line',
    source: blockPreviewSourceId,
    filter: ['==', ['get', 'Layer'], 'ROAD_PRIMARY'],
    paint: {
      'line-color': '#ff6600',
      'line-width': {
        "base": 1,
        "stops": [[0, 6], [22, 6]]
      },
      'line-opacity': 0.6
    }
  });
  
  window.map.addLayer({
    id: `${blockPreviewSourceId}-secondary`,
    type: 'line',
    source: blockPreviewSourceId,
    filter: ['==', ['get', 'Layer'], 'ROAD_SECONDARY'],
    paint: {
      'line-color': '#ffaa00',
      'line-width': {
        "base": 1,
        "stops": [[0, 6], [22, 6]]
      },
      'line-opacity': 0.6
    }
  });
}

/**
 * Hide block preview
 */
function hideBlockPreview() {
  if (blockPreviewSourceId) {
    try {
      // Remove preview layers
      if (window.map.getLayer(`${blockPreviewSourceId}-primary`)) {
        window.map.removeLayer(`${blockPreviewSourceId}-primary`);
      }
      if (window.map.getLayer(`${blockPreviewSourceId}-secondary`)) {
        window.map.removeLayer(`${blockPreviewSourceId}-secondary`);
      }
      // Remove preview source
      if (window.map.getSource(blockPreviewSourceId)) {
        window.map.removeSource(blockPreviewSourceId);
      }
    } catch (err) {
      // Silently handle cleanup errors
    }
    blockPreviewSourceId = null;
  }
}

// Global variables
window.map = null;
window.draw = null;

/**
 * Check if all required libraries are loaded
 */
function checkLibrariesSync() {
  const libraries = {
    mapboxgl: typeof mapboxgl !== 'undefined',
    MapboxGeocoder: typeof MapboxGeocoder !== 'undefined',
    MapboxDraw: typeof MapboxDraw !== 'undefined',
    turf: typeof turf !== 'undefined'
  };
  
  const missing = Object.entries(libraries)
    .filter(([name, loaded]) => !loaded)
    .map(([name]) => name);
    
  if (missing.length > 0) {
    console.error('❌ Missing libraries:', missing);
    return false;
  }
  
  return true;
}

/**
 * Initialize Mapbox map with all controls and functionality
 */
function initializeMap() {
  console.log('🗺️ Initializing map...');
  
  // All library checks are done in HTML before this function is called
  if (!window.MAPBOX_TOKEN) {
    if (!window._mapTokenRetry) window._mapTokenRetry = 0;
    if (!window.RUNTIME_CONFIG_READY) {
      // Defer until runtime config promise resolves
      console.log('⏳ MAPBOX_TOKEN not ready yet; deferring map init until config promise resolves...');
      (window.CONFIG_READY_PROMISE || Promise.resolve()).then(() => {
        // Small timeout to ensure globals applied
        setTimeout(() => {
          if (!window.MAPBOX_TOKEN) {
            console.error('❌ Mapbox token still missing after config ready. Aborting map init.');
            return;
          }
          initializeMap();
        }, 50);
      });
      return;
    }
    if (!window.MAPBOX_TOKEN) {
      console.error('❌ Mapbox token not set after runtime config readiness!');
      return;
    }
  }
  
  if (typeof MapboxDraw === 'undefined') {
    console.error('❌ Mapbox Draw library not loaded!');
    return;
  }
  
  // Get map container
  const mapContainer = document.getElementById('map');
  if (!mapContainer) {
    console.error('❌ Map container not found!');
    return;
  }
  
  // Check if Mapbox token is available
  if (!window.MAPBOX_TOKEN) {
    console.error('❌ Mapbox token not found!');
    return;
  }
  
  
  // Set Mapbox access token
  mapboxgl.accessToken = window.MAPBOX_TOKEN;

  // Get site ID from URL parameters instead of localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const siteIdFromUrl = urlParams.get('site');
  let siteInitializedInMap = false; // Track if we initialized with site data
  
  console.log('🚀 Map initialization - siteId from URL:', siteIdFromUrl);
  
  // Start with world view default (for home page with no site parameter)
  let initialMapState = {
    center: [0, 20], // Default world view
    zoom: 2, 
    pitch: 0,
    bearing: 0
  };
  
  if (siteIdFromUrl) {
    // We have a site ID in URL - load that specific site
    const mapPositions = JSON.parse(localStorage.getItem('siteMapPositions') || '{}');
    const savedSites = JSON.parse(localStorage.getItem("savedSites") || "[]");
    const activeSite = savedSites.find(s => s.id === siteIdFromUrl);
    
    console.log('🔍 Site lookup from URL:', { siteIdFromUrl, foundSite: !!activeSite, savedSites: savedSites.length });
    
    if (activeSite) {
      // Set this as the active site
      window.currentSiteId = activeSite.id;
      localStorage.setItem("activeSiteId", activeSite.id);
      
      const savedPosition = mapPositions[activeSite.id];
      if (savedPosition) {
        // Use saved map position for this site
        console.log('📍 Using saved position for site:', activeSite.name);
        initialMapState = {
          center: savedPosition.center,
          zoom: savedPosition.zoom,
          pitch: savedPosition.pitch,
          bearing: savedPosition.bearing
        };
        siteInitializedInMap = true;
      } else if (activeSite.geojson && activeSite.geojson.features[0]) {
        // No saved position but we have site boundary - calculate bounds
        try {
          const bbox = turf.bbox(activeSite.geojson.features[0]);
          const center = turf.center(activeSite.geojson.features[0]);
          console.log('📐 Calculated center for site:', activeSite.name, center.geometry.coordinates);
          initialMapState = {
            center: center.geometry.coordinates,
            zoom: 14, // Good zoom for site boundaries
            pitch: 45,
            bearing: 0
          };
          siteInitializedInMap = true;
        } catch (err) {
          console.warn('⚠️ Error calculating site bounds:', err);
          // Fallback for active site - use world view for new sites
          initialMapState = {
            center: [0, 20], // World view fallback
            zoom: 2,
            pitch: 0,
            bearing: 0
          };
          siteInitializedInMap = true;
        }
      } else {
        // Active site found but no geojson - use world view for new sites
        console.log('⚠️ Active site found but no boundary data, using world view');
        initialMapState = {
          center: [0, 20], // World view for new sites
          zoom: 2,
          pitch: 0,
          bearing: 0
        };
        siteInitializedInMap = true;
      }
    } else {
      // Site ID in URL but site not found - redirect to home
      console.log('⚠️ Site ID in URL but site not found, redirecting to home');
      console.log('🔍 Debug info:', {
        siteId: siteId,
        savedSitesCount: savedSites.length,
        siteExists: savedSites.some(s => s.id === siteId),
        allSiteIds: savedSites.map(s => s.id),
        currentUrl: window.location.href
      });
      // Instead of immediate redirect, try one more time after a brief delay
      setTimeout(() => {
        const savedSitesAgain = JSON.parse(localStorage.getItem('savedSites') || '[]');
        const foundSite = savedSitesAgain.find(s => s.id === siteId);
        if (foundSite) {
          console.log('✅ Site found on retry, reloading page properly');
          window.location.reload();
        } else {
          console.log('⚠️ Site still not found after retry, redirecting to home');
          window.location.href = window.location.origin + window.location.pathname;
        }
      }, 100);
      return;
    }
  } else {
    // No site in URL - this is the home/world view page
    console.log('🌍 No site in URL - using world view (home page)');
    localStorage.removeItem("activeSiteId"); // Clear any old active site
  }
  
  console.log('🗺️ Final initial map state:', initialMapState);
  // Only use world view if truly no active site context


  try {
    // Prevent multiple map instances
    if (window.map) {
      console.log('🔄 Map already exists, removing previous instance');
      window.map.remove();
      window.map = null;
    }
    
    // Initialize map with appropriate starting position
    window.map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: initialMapState.center,
      zoom: initialMapState.zoom,
      pitch: initialMapState.pitch,
      bearing: initialMapState.bearing
    });
    
    // Configure scroll zoom for smooth cursor-anchored zooming
    window.map.scrollZoom.enable();
    window.map.scrollZoom.setZoomRate(1/300);
    window.map.scrollZoom.setWheelZoomRate(1/300);
    
    console.log('✅ Map initialized successfully');
        
    // Add navigation controls
    window.map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    window.map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

  // Initialize geocoder
  const geocoder = new MapboxGeocoder({
    accessToken: window.MAPBOX_TOKEN,
    mapboxgl: mapboxgl,
    marker: false,
    placeholder: "Search locations"
  });
  
  const geoMount = document.getElementById('geocoder');
  if (geoMount) {
    // Clear any existing geocoder content first
    geoMount.innerHTML = '';
    geoMount.appendChild(geocoder.onAdd(window.map));
  }
  
  // Let Mapbox Geocoder handle zoom behavior naturally - no custom override needed
  


  // Initialize Mapbox Draw for drawing polygons (no UI controls)
  window.draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {
      polygon: false,
      trash: false,
      point: false,
      line_string: false,
      combine_features: false,
      uncombine_features: false
    },
    defaultMode: 'simple_select'
  });
  
  window.map.addControl(window.draw);

  // Draw event handlers
  window.map.on('draw.create', (e) => {
    console.log('🎯 draw.create event fired - starting boundary processing...');
    const feat = e.features?.[0];
    if (!feat || feat.geometry.type !== 'Polygon') return;

    // Remove any extra polygons — only keep the latest one
    const all = window.draw.getAll();
    all.features.forEach(f => {
      if (f.id !== feat.id && f.geometry.type === 'Polygon') {
        window.draw.delete(f.id);
      }
    });

    // Persist this feature FIRST
    window.siteBoundary = feat;
    
    // Calculate area and save to localStorage
    calculateAndDisplayArea(feat);
    localStorage.setItem('siteBoundary', JSON.stringify({ features: [feat] }));
    
    console.log('💾 About to call autoSaveCurrentSite...');
    // Auto-save the site immediately to savedSites
    autoSaveCurrentSite();
    console.log('✅ autoSaveCurrentSite completed');
    
    // 🔹 Automatically save analysis to data folder
    console.log("💾 Automatically saving analysis after drawing boundary...");
    const siteId = window.getCurrentSiteId?.() || "site-" + Date.now();
    const boundary = feat.geometry.coordinates[0];
    
    if (typeof window.exportSiteAnalysisToDataFolder === 'function') {
      try {
        // Use setTimeout to avoid blocking the main draw.create flow
        setTimeout(async () => {
          try {
            await window.exportSiteAnalysisToDataFolder(boundary, siteId);
            console.log(`✅ Site analysis auto-saved for: ${siteId}`);
          } catch (err) {
            console.error("❌ Auto-save failed:", err);
          }
        }, 100);
      } catch (err) {
        console.error("❌ Auto-save setup failed:", err);
      }
    } else {
      console.error("❌ exportSiteAnalysisToDataFolder not found.");
    }
    
    // Note: Removed scheduleAutosave() to prevent double autosave and URL updates

    // Show Generate button
    toggleGenerateButton(true);

    // Remove hint
    removeDrawHint();
    
    // Refresh perimeter IMMEDIATELY to show our custom blue outline
    refreshPerimeter();
    
    // Then hide the draw feature after a longer delay to avoid conflicts
    setTimeout(() => {
      try {
        window.draw.delete(feat.id);
      } catch (err) {
        console.warn("⚠️ Could not delete draw feature:", err);
      }
    }, 300);

    // ✅ Force exit draw mode and clean up
    setTimeout(() => {
      try {
        window.draw.changeMode('simple_select');
        window.map.getCanvas().style.cursor = '';
        // Remove any dangling incomplete features
        const current = window.draw.getAll();
        if (current.features.length > 0) {
          current.features.forEach(f => {
            if (f.id !== feat.id) {
              window.draw.delete(f.id);
            }
          });
        }
        // Disable draw tool to prevent additional drawing
        window.draw.changeMode('simple_select');
        console.log('✅ Draw tool disabled after boundary creation');
      } catch (err) {
        console.warn("⚠️ Cleanup after draw failed:", err);
      }
    }, 400);

  });
  
  window.map.on('draw.update', updateBoundary);
  window.map.on('draw.delete', updateBoundary);

  // Handle draw mode changes (show/hide hint only)
  window.map.on('draw.modechange', (e) => {
    console.log('🎨 Draw mode changed to:', e.mode, 'siteBoundary exists:', !!window.siteBoundary, 'blockPlacementMode:', blockPlacementMode);
    
    // Prevent draw polygon mode if boundary already exists or in block placement mode
    if (e.mode === 'draw_polygon' && (window.siteBoundary || blockPlacementMode)) {
      console.log('🚫 Preventing draw polygon mode - boundary exists or in block placement mode');
      try {
        window.draw.changeMode('simple_select');
        console.log('✅ Successfully changed to simple_select mode');
      } catch (err) {
        console.warn('⚠️ Failed to exit draw polygon mode:', err);
      }
      return;
    }
    
    if (e.mode === 'draw_polygon') {
      console.log('✅ Allowing draw polygon mode');
      showDrawHint();
      // Ensure double click zoom is disabled during drawing
      window.map.doubleClickZoom.disable();
    } else {
      console.log('✅ Non-draw mode active:', e.mode);
      removeDrawHint();
      // Re-enable double click zoom when not drawing
      window.map.doubleClickZoom.enable();
    }
  });
  
  // Handle map clicks for block placement
  window.map.on('click', (e) => {
    console.log('🖱️ Map clicked:', e.lngLat, 'blockPlacementMode:', blockPlacementMode, 'activeBlockType:', activeBlockType);
    if (blockPlacementMode && activeBlockType) {
      placeBlockAtLocation(e.lngLat);
    }
  });

  // No need for double-click or keyboard handlers: draw.create completion always exits draw mode

  // Add map movement listeners for position saving
  window.map.on('moveend', () => {
    // Debounce map position saving to avoid excessive saves during animations
    clearTimeout(window.mapSaveTimeout);
    window.mapSaveTimeout = setTimeout(saveMapPosition, 1000);
  });
  
  window.map.on('zoomend', saveMapPosition);
  window.map.on('pitchend', saveMapPosition);
  window.map.on('rotateend', saveMapPosition);
  
  // Map load event
  window.map.on('load', () => {
    // Check if we have a site ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const siteIdFromUrl = urlParams.get('site');
    
    if (siteIdFromUrl) {
      // We have a site from URL - restore the site data
      restoreActiveSite(true); // Skip map positioning since we already positioned correctly
    } else {
      // No site in URL - just restore any legacy boundary data
      restoreBoundary();
    }
    
    // Initialize UI after map is fully loaded
    try {
      initializeDrawMode();
      initializeSiteNamePersistence();
    } catch (err) {
      console.warn('⚠️ Error initializing UI components:', err);
    }
    
    console.log('✅ Map load complete - auto-save integrated into draw.create listener');
  });
  
  window.map.on('error', (e) => {
    console.error('❌ Map error:', e);
  });
  // End of try block for map initialization (falls through to catch below)
  
  } catch (error) {
    console.error('❌ Error initializing map:', error);
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
      mapContainer.innerHTML = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: red;">
          <h3>Error: Map initialization failed</h3>
          <p>Error: ${error.message}</p>
          <p>Please refresh the page</p>
        </div>
      `;
    }
  }
}

/**
 * Restore saved boundary from localStorage on app startup
 */
function restoreBoundary() {
  // Check if we're loading a specific site from profile
  const urlParams = new URLSearchParams(window.location.search);
  const siteId = urlParams.get('site');
  const siteName = urlParams.get('siteName');
  
  let siteData = null;
  
  // Try to load specific site from selectedSiteFull
  try {
    const selectedSiteFull = localStorage.getItem('selectedSiteFull');
    
    if (selectedSiteFull) {
      const parsedSite = JSON.parse(selectedSiteFull);
      
      // First priority: Match by timestamp if both exist
      if (siteId && parsedSite.timestamp && parsedSite.timestamp === siteId) {
        siteData = parsedSite;
      } 
      // Second priority: Match by name if provided in URL
      else if (siteName && parsedSite.name === decodeURIComponent(siteName)) {
        siteData = parsedSite;
      } 
      // Third priority: If no URL params, use the selected site (for navigation from profile)
      else if (!siteId && !siteName) {
        siteData = parsedSite;
      }
      // Last resort: If URL params don't match, still try to load if it's a reasonable site
      else if (parsedSite.geojson && parsedSite.geojson.features && parsedSite.geojson.features.length > 0) {
        siteData = parsedSite;
      }
      
      // Clean up the selectedSiteFull after loading to avoid confusion
      localStorage.removeItem('selectedSiteFull');
    }
  } catch (err) {
    console.warn('⚠️ Error loading selectedSiteFull:', err);
  }
  
  // Fallback: If we still don't have site data but have URL params, try to find it in savedSites
  if (!siteData && (siteId || siteName)) {
    try {
      const savedSites = JSON.parse(localStorage.getItem('savedSites') || '[]');
      
      // Try to find the site by timestamp first, then by name
      const foundSite = savedSites.find(site => {
        if (siteId && site.timestamp === siteId) {
          return true;
        }
        if (siteName && site.name === decodeURIComponent(siteName)) {
          return true;
        }
        return false;
      });
      
      if (foundSite) {
        siteData = foundSite;
      }
    } catch (err) {
      console.warn('⚠️ Error in savedSites fallback:', err);
    }
  }
  
  // If we have site data from profile, use it
  if (siteData && siteData.geojson && siteData.geojson.features && siteData.geojson.features.length > 0) {
    window.siteBoundary = siteData.geojson.features[0];
    
    // Update site name in the UI and ensure perfect sync
    if (siteData.name) {
      syncSiteName(siteData.name);
    }
    
    refreshPerimeter();
    calculateAndDisplayArea(window.siteBoundary);
    
    // Map position already set during initialization - no need to reposition
    
    // Show generate homes button
    toggleGenerateButton(true);
    
    return;
  }
  
  // Fallback to regular siteBoundary loading
  const saved = localStorage.getItem('siteBoundary');
  if (!saved) {
    return;
  }
  
  try {
    const data = JSON.parse(saved);
    
    if (data.features?.length) {
      window.siteBoundary = data.features[0];
      refreshPerimeter();
      calculateAndDisplayArea(window.siteBoundary);
      
      // Show generate homes button since we have a boundary
      toggleGenerateButton(true);
      
      // Map position already set during initialization - no need to reposition
    }
  } catch (err) {
    console.error('❌ Failed to restore boundary:', err);
    // Clear corrupted data
    localStorage.removeItem('siteBoundary');
  }
}

/**
 * Restore the active site based on activeSiteId from localStorage
 */
function restoreActiveSite(skipMapPositioning = false) {
  const activeId = localStorage.getItem("activeSiteId");
  
  if (!activeId) {
    return;
  }

  const savedSites = JSON.parse(localStorage.getItem("savedSites") || "[]");
  
  const site = savedSites.find(s => s.id === activeId);
  if (!site) {
    return;
  }

  window.currentSiteId = site.id;
  window.siteBoundary = site.geojson.features[0];
  
  // Update UI and localStorage
  updateSiteNameInUI(site.name);
  
  // Refresh map display (but without repositioning)
  refreshPerimeter();
  calculateAndDisplayArea(window.siteBoundary);
  
  // Show generate button since we have a boundary
  toggleGenerateButton(true);
  
  // Never reposition the map - it should stay where initialized
}

/**
 * Schedule autosave of boundary data
 */
function scheduleAutosave(delay = 300) {
  // Clear any existing autosave timeout
  if (window.autosaveTimeout) {
    clearTimeout(window.autosaveTimeout);
  }
  
  // Schedule new autosave
  window.autosaveTimeout = setTimeout(() => {
    try {
      if (window.siteBoundary) {
        // Standard boundary autosave
        localStorage.setItem('siteBoundary', JSON.stringify({ features: [window.siteBoundary] }));
        localStorage.setItem('lastSaved', new Date().toISOString());
        
        // Also auto-save to savedSites continuously
        autoSaveCurrentSite();
      }
    } catch (error) {
      console.error('❌ Autosave failed:', error);
    }
  }, delay);
}

/**
 * Clear all drawn features and reset state
 */
function clearAll() {
  // Clear draw features
  if (window.draw) {
    window.draw.deleteAll();
    window.draw.changeMode('simple_select');
  }
  
  // Clear site boundary
  window.siteBoundary = null;
  
  // Clear generated houses
  if (window.map) {
    try {
      // Remove houses layer and source
      if (window.map.getLayer('generated-houses-fill')) {
        window.map.removeLayer('generated-houses-fill');
      }
      if (window.map.getSource('generated-houses')) {
        window.map.removeSource('generated-houses');
      }
      
      // Clear all placed road blocks (dynamic sources starting with 'placed-block-')
      const style = window.map.getStyle();
      if (style && style.sources) {
        Object.keys(style.sources).forEach(sourceId => {
          if (sourceId.startsWith('placed-block-')) {
            try {
              // Remove associated layers first
              if (window.map.getLayer(`${sourceId}-primary`)) {
                window.map.removeLayer(`${sourceId}-primary`);
              }
              if (window.map.getLayer(`${sourceId}-secondary`)) {
                window.map.removeLayer(`${sourceId}-secondary`);
              }
              // Then remove the source
              if (window.map.getSource(sourceId)) {
                window.map.removeSource(sourceId);
              }
            } catch (err) {
              console.warn(`Error removing block source ${sourceId}:`, err);
            }
          }
        });
      }
      
      console.log('✅ Cleared all houses and road blocks from map');
    } catch (err) {
      console.warn('Error clearing map features:', err);
    }
  }
  
  // Reset housing metrics
  resetHomingMetrics();
  
  // Clear perimeter display
  refreshPerimeter();
  
  // Reset area display
  updateAreaDisplay(0);
  
  // Hide block placement panel
  toggleBlockPanel(false);
  
  // Hide generate button
  toggleGenerateButton(false);
  
  // Remove hints
  removeDrawHint();
  
  // Clear localStorage
  localStorage.removeItem('siteBoundary');
  
  // Reset cursor
  if (window.map) {
    window.map.getCanvas().style.cursor = '';
  }
  
  console.log('🧹 Complete site reset - boundary, houses, roads, and metrics cleared');
}

/**
 * Refresh and display the site boundary perimeter
 */
function refreshPerimeter() {
  try {
    // Wait for map style to be loaded before adding sources
    if (!window.map.isStyleLoaded()) {
      window.map.once('styledata', () => {
        refreshPerimeter();
      });
      return;
    }
    
    // Remove existing perimeter layers if they exist
    if (window.map.getLayer('site-perimeter')) {
      window.map.removeLayer('site-perimeter');
    }
    if (window.map.getLayer('site-perimeter-fill')) {
      window.map.removeLayer('site-perimeter-fill');
    }
    if (window.map.getSource('site-perimeter')) {
      window.map.removeSource('site-perimeter');
    }
    
    // If no boundary, just clear and return
    if (!window.siteBoundary) {
      return;
    }
    
    // Validate the boundary data
    if (!window.siteBoundary.geometry || !window.siteBoundary.geometry.coordinates) {
      console.error('❌ Invalid siteBoundary structure:', window.siteBoundary);
      return;
    }
    
    // Add the boundary as a map layer with styled perimeter
    window.map.addSource('site-perimeter', {
      type: 'geojson',
      data: window.siteBoundary
    });
    
    // Add fill layer
    window.map.addLayer({
      id: 'site-perimeter-fill',
      type: 'fill',
      source: 'site-perimeter',
      paint: {
        'fill-color': '#1d4ed8',
        'fill-opacity': 0.1
      }
    });
    
    // Add stroke layer
    window.map.addLayer({
      id: 'site-perimeter',
      type: 'line',
      source: 'site-perimeter',
      paint: {
        'line-color': '#1d4ed8',
        'line-width': 3,
        'line-opacity': 0.8
      }
    });
  } catch (error) {
    console.error('❌ Error refreshing perimeter:', error);
  }
}

/**
 * Calculate and display area information
 */
function calculateAndDisplayArea(polygon) {
  try {
    if (!polygon) throw new Error('No polygon provided');
    // Accept Feature or raw geometry
    let featureLike;
    if (polygon.type === 'Feature') {
      featureLike = polygon;
    } else if (polygon.geometry && polygon.geometry.type) {
      featureLike = polygon; // already a feature-like object
    } else if (polygon.type === 'Polygon' || polygon.type === 'MultiPolygon') {
      featureLike = { type: 'Feature', geometry: polygon, properties: {} };
    } else {
      throw new Error('Unsupported polygon object');
    }
    const area = turf.area(featureLike);
    const haNumber = parseFloat((area / 10000).toFixed(2));
    
    // Update the area display in the UI
    updateAreaDisplay(haNumber);
    
    // Show block placement panel when site boundary exists
    toggleBlockPanel(true);
  } catch (error) {
    console.error('❌ Error calculating area:', error);
  }
}

/**
 * Update boundary when draw events occur (for updates/deletes)
 */
function updateBoundary(e) {
  const data = window.draw.getAll();
  if (data.features.length) {
    // Find the polygon
    const polygon = data.features.find(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
    if (polygon) {
      // Update global boundary
      window.siteBoundary = polygon;
      refreshPerimeter();
      calculateAndDisplayArea(polygon);
      
      // Save to localStorage
      localStorage.setItem('siteBoundary', JSON.stringify({ features: [polygon] }));
      
      // Auto-save the site immediately
      autoSaveCurrentSite();
      
      // Schedule autosave to also update savedSites if applicable
      scheduleAutosave();
      
      // Show generate homes button
      toggleGenerateButton(true);
      
      return;
    }
  }
  
  // No polygon found - boundary was deleted
  window.siteBoundary = null;
  refreshPerimeter();
  updateAreaDisplay(0);
  localStorage.removeItem('siteBoundary');
  
  // Hide generate homes button
  toggleGenerateButton(false);
}

/**
 * Save current map position for the current site
 */
function saveMapPosition() {
  if (!window.map || !window.siteBoundary) return;
  
  const currentId = window.currentSiteId;
  if (!currentId) {
    return;
  }
  
  console.log(`💾 Saving map position for site: ${currentId}`);
  
  const mapState = {
    center: window.map.getCenter(),
    zoom: window.map.getZoom(),
    pitch: window.map.getPitch(),
    bearing: window.map.getBearing()
  };
  
  // Store map position with site ID as key
  const mapPositions = JSON.parse(localStorage.getItem('siteMapPositions') || '{}');
  mapPositions[currentId] = mapState;
  localStorage.setItem('siteMapPositions', JSON.stringify(mapPositions));
}

/**
 * Restore map position for the current site
 */
function restoreMapPosition() {
  if (!window.map) return;
  
  const currentId = window.currentSiteId;
  if (!currentId) {
    return;
  }
  
  const mapPositions = JSON.parse(localStorage.getItem('siteMapPositions') || '{}');
  const savedPosition = mapPositions[currentId];
  
  if (savedPosition) {
    try {
      window.map.jumpTo({
        center: savedPosition.center,
        zoom: savedPosition.zoom,
        pitch: savedPosition.pitch,
        bearing: savedPosition.bearing
      });
    } catch (err) {
      console.warn('⚠️ Error restoring map position:', err);
    }
  }
}

/**
 * Get current site name consistently
 */
function getCurrentSiteName() {
  // Always use the UI as the authoritative source
  const navNameEl = document.querySelector('#site-name-nav span');
  let name = (navNameEl?.textContent || '').trim();
  
  // Fallback to localStorage if UI is empty
  if (!name) {
    name = (localStorage.getItem('siteName') || '').trim();
  }
  
  return name || 'Untitled Site';
}

/**
 * Synchronize site name between UI and localStorage
 * @param {string} newName - Optional new name to set, if not provided, syncs current UI value
 */
function syncSiteName(newName = null) {
  const navNameEl = document.querySelector('#site-name-nav span');
  
  if (newName) {
    // Set new name and sync everywhere
    if (navNameEl) {
      navNameEl.textContent = newName;
    }
    localStorage.setItem('siteName', newName);
  } else {
    // Sync current UI value to localStorage
    const currentUIName = (navNameEl?.textContent || '').trim();
    const currentStorageName = (localStorage.getItem('siteName') || '').trim();
    
    if (currentUIName && currentUIName !== currentStorageName) {
      localStorage.setItem('siteName', currentUIName);
    } else if (currentStorageName && currentStorageName !== currentUIName && navNameEl) {
      navNameEl.textContent = currentStorageName;
    }
  }
}

/**
 * Auto-save current site to localStorage without user prompts
 * This enables continuous saving as the user works
 */
function autoSaveCurrentSite() {
  // Check if we have a boundary to save
  if (!window.siteBoundary) {
    return;
  }
  
  // Create geojson from current boundary
  const geojson = {
    type: 'FeatureCollection',
    features: [window.siteBoundary]
  };
  
  // Get current site name consistently
  const name = getCurrentSiteName();
  
  // Ensure UI and localStorage are in sync
  syncSiteName(name);
  
  // Save current map position
  saveMapPosition();

  // Generate or reuse stable site ID (matching saveCurrentSite pattern)
  const id = window.currentSiteId || `site-${Date.now()}`;
  if (!window.currentSiteId) {
    window.currentSiteId = id;
  }

  const site = {
    id, // Include stable ID for Profile page linking
    name,
    geojson,
    // capture current app state so we can restore the phase later
    meta: (() => {
      const t = window.masterplanningTool || {};
      try {
        return {
          phase: t.phase || 1,
          gridPitchX: t.gridPitchX,
          gridPitchY: t.gridPitchY,
          gridAngleRowDeg: t.gridAngleRowDeg,
          gridAngleColDeg: t.gridAngleColDeg,
          gridOffset: t.gridOffset,
          roadWidth: t.roadWidth,
          gridData: t.gridData || null
        };
      } catch {
        return { phase: 1 };
      }
    })(),
    timestamp: new Date().toISOString(),
    lastModified: new Date().toISOString() // Add lastModified for consistency
  };

  let savedSites = JSON.parse(localStorage.getItem('savedSites') || '[]');
  
  // Check if this site already exists by ID first, then by name
  let existingIndex = savedSites.findIndex(s => s.id === id);
  
  // If not found by ID, check by name (for legacy sites without IDs)
  if (existingIndex === -1) {
    existingIndex = savedSites.findIndex(s => s.name === name);
  }
  
  // If still not found by name, try to find by boundary geometry (in case user renamed the site)
  if (existingIndex === -1) {
    try {
      // Look for sites with same boundary data (indicating it's the same site with a new name)
      const currentSiteBoundary = JSON.stringify(window.siteBoundary.geometry.coordinates);
      existingIndex = savedSites.findIndex(s => {
        if (s.geojson && s.geojson.features && s.geojson.features[0]) {
          const savedBoundary = JSON.stringify(s.geojson.features[0].geometry.coordinates);
          return savedBoundary === currentSiteBoundary;
        }
        return false;
      });
    } catch (err) {
      console.warn('⚠️ Error comparing boundaries:', err);
    }
  }
  
  if (existingIndex >= 0) {
    // Update existing site (this handles ID migration, renames, and regular updates)
    savedSites[existingIndex] = site;
  } else {
    // Add new site
    savedSites.push(site);
  }
  
  // Save to localStorage FIRST before updating URL
  localStorage.setItem('savedSites', JSON.stringify(savedSites));
  
  // Now safely update the URL after the site is saved
  const currentSiteIdFromUrl = getCurrentSiteIdFromUrl();
  if (!currentSiteIdFromUrl && existingIndex === -1) {
    // Only update URL for truly new sites, and only after saving
    try {
      const currentUrl = new URL(window.location);
      currentUrl.searchParams.set('site', id);
      window.history.replaceState({ siteId: id }, '', currentUrl.toString());
      window.currentSiteId = id;
      console.log(`🌐 Updated URL to include site ID: ${id} (via autosave)`);
    } catch (err) {
      console.warn('⚠️ Failed to update URL:', err);
    }
  }
}

/**
 * Save current site to localStorage with user feedback (manual save)
 */
function saveCurrentSite() {
  if (!window.siteBoundary) {
    alert("❌ No boundary to save.");
    return;
  }

  // Generate or reuse site ID
  const id = window.currentSiteId || `site-${Date.now()}`;

  // Get site name
  let name = (localStorage.getItem('siteName') || '').trim();
  if (!name) {
    const navNameEl = document.querySelector('#site-name-nav span');
    name = (navNameEl?.textContent || '').trim();
  }
  if (!name) name = "Untitled Site";

  const site = {
    id,
    name,
    geojson: { type: "FeatureCollection", features: [window.siteBoundary] },
    meta: {
      phase: window.masterplanningTool?.phase || 1,
      density: document.getElementById("density")?.textContent || null
    },
    lastModified: new Date().toISOString()
  };

  // Load existing and update
  let savedSites = JSON.parse(localStorage.getItem("savedSites") || "[]");
  const existingIndex = savedSites.findIndex(s => s.id === id);
  if (existingIndex > -1) {
    savedSites[existingIndex] = site;
  } else {
    savedSites.push(site);
  }

  localStorage.setItem("savedSites", JSON.stringify(savedSites));
  window.currentSiteId = id;

  // Navigate to the site URL if not already there
  const currentSiteIdFromUrl = getCurrentSiteIdFromUrl();
  if (currentSiteIdFromUrl !== id) {
    navigateToSite(id);
  } else {
    alert(`✅ "${name}" saved!`);
  }
}

/**
 * Initialize Generate Homes button functionality
 */
function initializeGenerateHomesButton() {
  const generateHomesBtn = document.getElementById('generate-homes');
  if (generateHomesBtn) {
    generateHomesBtn.addEventListener('click', async function() {
      console.log('🏠 Generate Homes button clicked');
      
      try {
        // Initialize house generator if not already done
        if (!window.houseGenerator) {
          window.houseGenerator = new HouseGenerator();
          await window.houseGenerator.loadHouseTypes();
        }
        
        // Get road centerlines from placed blocks
        const roads = extractRoadCenterlines();
        
        if (roads.length === 0) {
          alert('No roads found. Please place some blocks with road centerlines first.');
          return;
        }
        
        console.log(`📍 Found ${roads.length} road centerlines`);
        
        // Generate houses along roads
        const houses = await window.houseGenerator.generateHousesAlongRoads(roads, {
          edgeSpacing: 5, // 5 meters edge-to-edge
          roadOffset: 3   // 3 meters from road centerline
        });
        
        // Check if houses were generated
        if (houses && houses.features && houses.features.length > 0) {
          // Add houses to map
          addHousesToMap(houses);
          console.log(`✅ Generated ${houses.features.length} houses`);
        } else {
          console.log('⚠️ No houses were generated');
          resetHomingMetrics(); // Reset metrics if no houses generated
          alert('No houses could be generated. This might be due to insufficient space along roads or configuration issues.');
        }
        
      } catch (error) {
        console.error('❌ Error generating houses:', error);
        resetHomingMetrics(); // Reset metrics on error
        alert('Error generating houses. Please check the console for details.');
      }
    });
  }
}

/**
 * Initialize Block Placement buttons functionality
 */
function initializeBlockButtons() {
  console.log('🔧 Initializing block buttons...');
  
  // Ensure DOM is ready
  const blockPanel = document.getElementById('block-placement-panel');
  if (!blockPanel) {
    console.log('❌ Block placement panel not found in DOM, retrying in 100ms...');
    setTimeout(initializeBlockButtons, 100);
    return;
  }
  
  const blockButtons = document.querySelectorAll('.block-btn');
  console.log(`🔧 Found ${blockButtons.length} block buttons`);
  
  if (blockButtons.length === 0) {
    console.log('❌ No block buttons found in DOM, retrying in 100ms...');
    setTimeout(initializeBlockButtons, 100);
    return;
  }
  
  blockButtons.forEach((button, index) => {
    console.log(`🔧 Setting up button ${index + 1}: ${button.getAttribute('data-block')}`);
    button.addEventListener('click', function() {
      const blockType = this.getAttribute('data-block');
      console.log(`🏗️ Block button clicked: ${blockType}`);
      
      // Remove active class from all buttons
      blockButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      this.classList.add('active');
      
      // Enter block placement mode
      enterBlockPlacementMode(blockType);
      
      // Show notification
      const blockNumber = blockType.slice(-1);
      showNotification(`🏗️ Block ${blockNumber} Selected`, 'Click on the map to place the block', 'info');
    });
  });
  
  // Add escape key to exit block placement mode
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && blockPlacementMode) {
      exitBlockPlacementMode();
      // Remove active class from all buttons
      blockButtons.forEach(btn => btn.classList.remove('active'));
      showNotification('🚫 Block Placement Cancelled', 'Press a block button to start placing again', 'info');
    }
  });
}

/**
 * Main application initialization
 * Called when DOM is ready
 */
function initializeApp() {
  
  // Initialize core components
  initializeMap();
  initializeNavDropdown();
  initializeDrawMode();
  initializeGenerateHomesButton();
  initializeBlockButtons();
  initializeSiteNamePersistence();
  
  // Load block data for placement system
  loadBlockData();
  
  // Initially hide block panel until site boundary exists
  toggleBlockPanel(false);
  
  // Sync site name on startup
  setTimeout(() => syncSiteName(), 100);
  
  // Check for active site first, then fall back to legacy boundary restoration
  const activeId = localStorage.getItem("activeSiteId");
  if (activeId) {
    restoreActiveSite();
  } else {
    restoreBoundary();
  }
  
  // Make functions globally available
  window.saveCurrentSite = saveCurrentSite;
  window.autoSaveCurrentSite = autoSaveCurrentSite;
  window.saveMinimalSite = saveMinimalSite;
  window.syncSiteName = syncSiteName;
  window.clearAll = clearAll;
  window.scheduleAutosave = scheduleAutosave;
  window.enterBlockPlacementMode = enterBlockPlacementMode;
  window.exitBlockPlacementMode = exitBlockPlacementMode;
  window.exportSiteBoundaryForAI = exportSiteBoundaryForAI;
  window.requestAIPlacement = requestAIPlacement;
  window.processAIResponse = processAIResponse;
  window.handleAIResponseFile = handleAIResponseFile;
  window.loadSiteAnalysis = loadSiteAnalysis;
  window.placeBlockAtLocation = placeBlockAtLocation;
  window.showNotification = showNotification;
  window.transformBlockToGeo = transformBlockToGeo;
  
  // Expose blockPlacementMode state for UI checks
  Object.defineProperty(window, 'blockPlacementMode', {
    get: () => blockPlacementMode,
    enumerable: true,
    configurable: true
  });
  
}

// Initialize when DOM and libraries are ready
function startApp() {
  // Prevent multiple initializations
  if (window.appInitialized) {
    console.log('⚠️ App already initialized, skipping...');
    return;
  }
  
  // Since CDN scripts load synchronously, libraries should be available immediately
  if (checkLibrariesSync()) {
    initializeApp();
    window.appInitialized = true;
  } else {
    console.error('❌ Libraries not available immediately - there may be a loading issue');
    showLibraryError();
  }
}

function showLibraryError() {
  const mapContainer = document.getElementById('map');
  if (mapContainer) {
    mapContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        font-family: Arial, sans-serif;
        color: #374151;
        z-index: 1000;
      ">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <h2>Map Libraries Failed to Load</h2>
        <p>Please check your internet connection and refresh the page.</p>
        <button id="refresh-page-btn" type="button" style="
          padding: 12px 24px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          margin-top: 16px;
        ">Refresh Page</button>
      </div>
    `;

    // attach handler properly
    const refreshBtn = document.getElementById('refresh-page-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        location.reload();
      });
    }
  }
}

/**
 * Navigate to a specific site URL without page refresh
 */
function navigateToSite(siteId) {
  const currentUrl = new URL(window.location);
  currentUrl.searchParams.set('site', siteId);
  
  // Use history API to update URL without page refresh
  window.history.pushState({ siteId }, '', currentUrl.toString());
  
  // Update the window's current site ID
  window.currentSiteId = siteId;
  
  console.log(`🌐 Updated URL to include site ID: ${siteId}`);
}

/**
 * Navigate to home page (world view) without page refresh
 */
function navigateToHome() {
  const currentUrl = new URL(window.location);
  currentUrl.searchParams.delete('site');
  
  // Use history API to update URL without page refresh
  window.history.pushState({}, '', currentUrl.toString());
  
  // Clear current site ID
  window.currentSiteId = null;
  
  console.log('🌐 Updated URL to remove site ID (home view)');
}

/**
 * Get current site ID from URL
 */
function getCurrentSiteIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('site');
}

// Make navigation functions available globally
window.navigateToSite = navigateToSite;
window.navigateToHome = navigateToHome;
window.getCurrentSiteIdFromUrl = getCurrentSiteIdFromUrl;

// Auto-initialize the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

/**
 * Extract road centerlines from placed blocks on the map
 * @returns {Array} Array of road centerline features
 */
function extractRoadCenterlines() {
  const roads = [];
  
  // Get all placed block sources from the map
  const style = window.map.getStyle();
  const sources = style.sources;
  
  for (const sourceId in sources) {
    if (sourceId.startsWith('placed-block-')) {
      const source = window.map.getSource(sourceId);
      if (source && source._data) {
        const data = source._data;
        
        // Extract road features from the block data
        if (data.features) {
          data.features.forEach(feature => {
            // Check if this feature represents a road centerline
            if (feature.properties && 
                (feature.properties.Layer === 'ROAD_PRIMARY' || 
                 feature.properties.Layer === 'ROAD_SECONDARY' ||
                 feature.properties.Layer === 'ROAD_TERTIARY' ||
                 feature.properties.Layer?.includes('ROAD'))) {
              
              // Ensure it's a LineString
              if (feature.geometry && feature.geometry.type === 'LineString') {
                roads.push(feature);
              }
            }
          });
        }
      }
    }
  }
  
  // Also include generated roads from the road extension system
  if (window.map.getSource('generated-roads')) {
    const generatedData = window.map.getSource('generated-roads')._data;
    if (generatedData && generatedData.features) {
      generatedData.features.forEach(feature => {
        if (feature.geometry && feature.geometry.type === 'LineString') {
          roads.push(feature);
        }
      });
    }
  }
  
  console.log(`🛣️ Extracted ${roads.length} road centerlines from placed blocks and generated roads`);
  return roads;
}

/**
 * Add generated houses to the map with proper styling
 * @param {Object} houses - GeoJSON FeatureCollection of houses
 */
function addHousesToMap(houses) {
  if (!houses || !houses.features || houses.features.length === 0) {
    console.log('No houses to add to map');
    resetHomingMetrics(); // Reset metrics when no houses to add
    return;
  }
  
  // Remove existing houses if any
  if (window.map.getSource('generated-houses')) {
    window.map.removeLayer('generated-houses-fill');
    window.map.removeSource('generated-houses');
    
    // Reset metrics when removing old houses
    resetHomingMetrics();
  }
  
  // Add houses source
  window.map.addSource('generated-houses', {
    type: 'geojson',
    data: houses
  });
  
  // Add house 3D extrusion layer with type-based colors
  window.map.addLayer({
    id: 'generated-houses-fill',
    type: 'fill-extrusion',
    source: 'generated-houses',
    paint: {
      'fill-extrusion-color': [
        'case',
        ['==', ['get', 'houseType'], 1], '#ff4444', // Type 1 = red
        ['==', ['get', 'houseType'], 2], '#44ff44', // Type 2 = green
        ['==', ['get', 'houseType'], 3], '#4444ff', // Type 3 = blue
        '#888888' // Default gray
      ],
      'fill-extrusion-height': [
        '*',
        ['get', 'height'], // Use height property in meters
        1 // Mapbox GL uses meters natively, so 1:1 conversion
      ],
      'fill-extrusion-base': 0, // Ground level
      'fill-extrusion-opacity': 0.9
    }
  });
  
  console.log(`🏠 Added ${houses.features.length} 3D houses to map with color coding`);
  
  // Update the home count and density in the UI
  updateHomingMetrics(houses.features.length);
}

/**
 * Update home count and housing density in the UI
 * @param {number} houseCount - Number of houses generated
 */
function updateHomingMetrics(houseCount) {
  // Update home count
  const homeCountElement = document.getElementById('home-count');
  if (homeCountElement) {
    homeCountElement.textContent = houseCount.toString();
  }
  
  // Calculate and update housing density
  const densityElement = document.getElementById('density');
  if (densityElement && window.siteBoundary) {
    try {
      // Calculate site area in hectares using Turf.js
      const siteArea = turf.area(window.siteBoundary); // Returns area in square meters
      const siteAreaHectares = siteArea / 10000; // Convert to hectares
      
      // Calculate housing density (homes per hectare)
      const density = houseCount / siteAreaHectares;
      
      // Update density display
      densityElement.textContent = `${density.toFixed(1)} homes/ha`;
      
      // Also update site area display
      const siteAreaElement = document.getElementById('site-area');
      if (siteAreaElement) {
        siteAreaElement.textContent = `${siteAreaHectares.toFixed(2)} ha`;
      }
      
      console.log(`📊 Updated metrics: ${houseCount} homes, ${siteAreaHectares.toFixed(2)} ha, ${density.toFixed(1)} homes/ha`);
    } catch (error) {
      console.error('❌ Error calculating housing density:', error);
      densityElement.textContent = 'Error';
    }
  } else {
    densityElement.textContent = 'N/A';
    console.log('⚠️ Cannot calculate density: missing site boundary or density element');
  }
}

/**
 * Reset home count and housing density to initial values
 */
function resetHomingMetrics() {
  const homeCountElement = document.getElementById('home-count');
  if (homeCountElement) {
    homeCountElement.textContent = '0';
  }
  
  const densityElement = document.getElementById('density');
  if (densityElement) {
    densityElement.textContent = 'N/A';
  }
  
  console.log('📊 Reset housing metrics to initial values');
}

// Block 3 Interactive Editing System
let block3EditMode = false;
let block3EditData = null;
let block3Endpoints = [];

// Road Extension System
let roadExtensionMode = false;
let selectedRoadEndpoint = null;
let extensionPreview = null;
let roadExtensionHandles = [];
let isExtending = false;
let newRoadsToAdd = [];

// Road extension rules configuration
const roadExtensionRules = {
  maxLength: 200,         // Max road length before auto-branching (meters)
  branchLength: 80,       // Length of new branch roads (meters)
  branchAngle: 90,        // Angle for perpendicular branches (degrees)
  minBranchSpacing: 60,   // Minimum distance between branches (meters)
  snapAngle: 15,          // Snap angles for clean layouts (degrees)
  previewColor: '#FFD700', // Gold color for preview
  extensionColor: '#FF6B35' // Orange-red for new roads
};

/**
 * Toggle Block 3 edit mode
 */
function toggleBlock3EditMode() {
  const btn = document.getElementById('block3-edit-btn');
  
  if (!block3EditMode) {
    // Enter edit mode
    enterBlock3EditMode();
    btn.textContent = '✅ Finish Editing';
    btn.classList.add('active');
  } else {
    // Exit edit mode
    exitBlock3EditMode();
    btn.textContent = '✏️ Edit Block 3';
    btn.classList.remove('active');
  }
}

/**
 * Enter Block 3 edit mode
 */
function enterBlock3EditMode() {
  console.log('🎯 Entering Block 3 edit mode');
  
  if (!loadedBlocks.Block3) {
    console.error('❌ Block 3 not loaded');
    return;
  }
  
  // Find a placed Block 3 instance to edit
  const placedBlock3 = findPlacedBlock3();
  if (!placedBlock3) {
    alert('No Block 3 found on the map. Please place a Block 3 first.');
    return;
  }
  
  block3EditMode = true;
  block3EditData = JSON.parse(JSON.stringify(placedBlock3)); // Deep copy of placed block
  
  // Highlight Block 3 on the map
  highlightBlock3();
  
  // Add endpoint handles
  addBlock3Endpoints();
  
  // Disable map rotation and other interactions
  window.map.dragRotate.disable();
  window.map.touchZoomRotate.disableRotation();
}

/**
 * Find a placed Block 3 instance on the map
 * @returns {Object|null} Block 3 GeoJSON data with geographic coordinates
 */
function findPlacedBlock3() {
  if (!window.map) return null;
  
  try {
    // Get all placed block sources from the map
    const style = window.map.getStyle();
    const sources = style.sources;
    
    for (const sourceId in sources) {
      if (sourceId.startsWith('placed-block-')) {
        const source = window.map.getSource(sourceId);
        if (source && source._data) {
          const data = source._data;
          
          // Check if this is a Block 3 (has only 1 feature and is a LineString)
          if (data.features && 
              data.features.length === 1 && 
              data.features[0].geometry && 
              data.features[0].geometry.type === 'LineString' &&
              data.features[0].geometry.coordinates.length === 2) {
            
            // This looks like a Block 3 (simple line with 2 endpoints)
            console.log(`🎯 Found Block 3 in source: ${sourceId}`);
            return data;
          }
        }
      }
    }
    
    console.log('❌ No placed Block 3 found on map');
    return null;
  } catch (error) {
    console.error('❌ Error finding placed Block 3:', error);
    return null;
  }
}

/**
 * Exit Block 3 edit mode
 */
function exitBlock3EditMode() {
  console.log('🏁 Exiting Block 3 edit mode');
  
  block3EditMode = false;
  
  // Remove highlight and endpoints
  removeBlock3Highlight();
  removeBlock3Endpoints();
  
  // Re-enable map interactions
  if (window.map) {
    window.map.dragRotate.enable();
    window.map.touchZoomRotate.enableRotation();
  }
  
  // Update the loaded blocks with changes
  loadedBlocks.Block3 = block3EditData;
  
  // Refresh the block display
  refreshBlock3Display();
  
  console.log('✅ Block 3 changes applied');
}

/**
 * Highlight Block 3 on the map
 */
function highlightBlock3() {
  if (!window.map) {
    console.error('❌ Map not available for Block3 highlighting');
    return;
  }
  
  if (!window.map.getSource('block3-highlight')) {
    window.map.addSource('block3-highlight', {
      type: 'geojson',
      data: block3EditData
    });
    
    window.map.addLayer({
      id: 'block3-highlight',
      type: 'line',
      source: 'block3-highlight',
      paint: {
        'line-color': '#ff4444',
        'line-width': 4,
        'line-opacity': 0.8
      }
    });
  }
}

/**
 * Remove Block 3 highlight
 */
function removeBlock3Highlight() {
  if (!window.map) return;
  
  if (window.map.getLayer('block3-highlight')) {
    window.map.removeLayer('block3-highlight');
  }
  if (window.map.getSource('block3-highlight')) {
    window.map.removeSource('block3-highlight');
  }
}

/**
 * Add draggable endpoint handles
 */
function addBlock3Endpoints() {
  if (!window.map || !block3EditData) {
    console.error('❌ Map or Block 3 data not available for endpoints');
    return;
  }
  
  const feature = block3EditData.features[0];
  const coordinates = feature.geometry.coordinates;
  
  // Create endpoint elements for start and end points
  coordinates.forEach((coord, index) => {
    // Validate coordinates are within valid lat/lng ranges
    const lng = coord[0];
    const lat = coord[1];
    
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      console.error(`❌ Invalid coordinates for endpoint ${index}: [${lng}, ${lat}]`);
      return; // Skip this endpoint
    }
    
    const endpoint = document.createElement('div');
    endpoint.className = 'block-endpoint';
    endpoint.dataset.index = index;
    
    try {
      // Convert coordinates to screen position
      const pixel = window.map.project([lng, lat]);
      endpoint.style.left = pixel.x + 'px';
      endpoint.style.top = pixel.y + 'px';
      
      // Add drag functionality
      makeEndpointDraggable(endpoint, index);
      
      window.map.getContainer().appendChild(endpoint);
      block3Endpoints.push(endpoint);
      
      console.log(`✅ Added endpoint ${index} at [${lng.toFixed(6)}, ${lat.toFixed(6)}]`);
    } catch (error) {
      console.error(`❌ Error creating endpoint ${index}:`, error);
    }
  });
}

/**
 * Remove endpoint handles
 */
function removeBlock3Endpoints() {
  block3Endpoints.forEach(endpoint => {
    endpoint.remove();
  });
  block3Endpoints = [];
}

/**
 * Make an endpoint draggable
 */
function makeEndpointDraggable(element, coordIndex) {
  let isDragging = false;
  
  element.addEventListener('mousedown', (e) => {
    isDragging = true;
    element.style.cursor = 'grabbing';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging || !window.map) return;
    
    // Convert mouse position to map coordinates
    const rect = window.map.getContainer().getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Update endpoint position
    element.style.left = x + 'px';
    element.style.top = y + 'px';
    
    // Convert to geographic coordinates
    const lngLat = window.map.unproject([x, y]);
    
    // Update the coordinates in our data
    block3EditData.features[0].geometry.coordinates[coordIndex] = [
      lngLat.lng, 
      lngLat.lat, 
      0.0 // Keep Z coordinate
    ];
    
    // Update the highlight layer
    if (window.map && window.map.getSource('block3-highlight')) {
      window.map.getSource('block3-highlight').setData(block3EditData);
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      element.style.cursor = 'grab';
      console.log('📍 Block 3 endpoint updated');
    }
  });
}

/**
 * Update endpoint positions when map moves
 */
function updateEndpointPositions() {
  if (!block3EditMode || !block3EditData) return;
  
  const coordinates = block3EditData.features[0].geometry.coordinates;
  
  block3Endpoints.forEach((endpoint, index) => {
    const pixel = window.map.project([coordinates[index][0], coordinates[index][1]]);
    endpoint.style.left = pixel.x + 'px';
    endpoint.style.top = pixel.y + 'px';
  });
}

/**
 * Refresh Block 3 display after editing
 */
function refreshBlock3Display() {
  if (!window.map) return;
  
  // Remove existing Block 3 from map if present
  const existingBlocks = window.map.querySourceFeatures('blocks');
  
  // Update the blocks source with new data
  if (window.map.getSource('blocks')) {
    // Rebuild blocks data with updated Block 3
    const allBlocksData = {
      type: 'FeatureCollection',
      features: []
    };
    
    // Add all loaded blocks
    Object.values(loadedBlocks).forEach(blockData => {
      allBlocksData.features.push(...blockData.features);
    });
    
    window.map.getSource('blocks').setData(allBlocksData);
  }
}

// Add map move listener to update endpoints
if (typeof window !== 'undefined' && window.map) {
  window.map.on('move', updateEndpointPositions);
}

/**
 * Toggle Road Extension Mode
 */
function toggleRoadExtensionMode() {
  const btn = document.getElementById('road-extension-btn');
  
  if (!roadExtensionMode) {
    // Enter road extension mode
    enterRoadExtensionMode();
    btn.textContent = '🛑 Stop Extending';
    btn.classList.add('active');
  } else {
    // Exit road extension mode
    exitRoadExtensionMode();
    btn.textContent = '🛣️ Extend Roads';
    btn.classList.remove('active');
  }
}

/**
 * Enter road extension mode
 */
function enterRoadExtensionMode() {
  console.log('🛣️ Entering road extension mode');
  
  // Check if map is initialized
  if (!window.map) {
    console.error('❌ Map not initialized yet');
    alert('Map is still loading. Please wait a moment and try again.');
    return;
  }
  
  // Check if we have any roads to extend
  const roads = extractRoadCenterlines();
  if (roads.length === 0) {
    alert('No roads found! Please place some blocks with roads first.');
    return;
  }
  
  roadExtensionMode = true;
  
  // Add road endpoint handles
  addRoadExtensionHandles();
  
  // Add map listeners for road extension
  window.map.on('click', onMapClickForRoadExtension);
  window.map.on('mousemove', onMouseMoveForRoadExtension);
  
  // Change cursor
  window.map.getCanvas().style.cursor = 'crosshair';
  
  console.log('✅ Road extension mode activated');
}

/**
 * Exit road extension mode
 */
function exitRoadExtensionMode() {
  console.log('🛑 Exiting road extension mode');
  
  if (!window.map) {
    console.error('❌ Map not initialized');
    return;
  }
  
  roadExtensionMode = false;
  selectedRoadEndpoint = null;
  isExtending = false;
  
  // Remove extension preview
  if (extensionPreview) {
    try {
      window.map.removeSource('road-extension-preview');
      window.map.removeLayer('road-extension-preview-line');
    } catch (e) {
      // Source/layer may not exist
    }
    extensionPreview = null;
  }
  
  // Remove extension handles
  removeRoadExtensionHandles();
  
  // Remove map listeners
  window.map.off('click', onMapClickForRoadExtension);
  window.map.off('mousemove', onMouseMoveForRoadExtension);
  
  // Reset cursor
  window.map.getCanvas().style.cursor = '';
  
  // Commit any new roads that were added
  commitNewRoads();
  
  console.log('✅ Road extension mode deactivated');
}

/**
 * Add road extension handles at road endpoints
 */
function addRoadExtensionHandles() {
  if (!window.map) {
    console.error('❌ Map not initialized for road extension handles');
    return;
  }
  
  const roads = extractRoadCenterlines();
  console.log(`🎯 Adding extension handles for ${roads.length} roads`);
  
  roadExtensionHandles = [];
  
  roads.forEach((road, roadIndex) => {
    if (road.geometry && road.geometry.coordinates) {
      const coords = road.geometry.coordinates;
      
      // Add handle at start of road
      const startHandle = {
        id: `road-start-${roadIndex}`,
        coordinates: coords[0],
        roadIndex: roadIndex,
        isStart: true,
        road: road
      };
      
      // Add handle at end of road
      const endHandle = {
        id: `road-end-${roadIndex}`,
        coordinates: coords[coords.length - 1],
        roadIndex: roadIndex,
        isStart: false,
        road: road
      };
      
      roadExtensionHandles.push(startHandle, endHandle);
    }
  });
  
  // Create visual handles on the map
  const handleFeatures = roadExtensionHandles.map(handle => ({
    type: 'Feature',
    properties: {
      id: handle.id,
      type: 'road-extension-handle'
    },
    geometry: {
      type: 'Point',
      coordinates: handle.coordinates
    }
  }));
  
  // Add handles source and layer
  if (!window.map.getSource('road-extension-handles')) {
    window.map.addSource('road-extension-handles', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: handleFeatures
      }
    });
    
    window.map.addLayer({
      id: 'road-extension-handles',
      type: 'circle',
      source: 'road-extension-handles',
      paint: {
        'circle-radius': 8,
        'circle-color': roadExtensionRules.extensionColor,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
        'circle-opacity': 0.9
      }
    });
    
    // Add hover effect
    window.map.on('mouseenter', 'road-extension-handles', () => {
      window.map.getCanvas().style.cursor = 'pointer';
    });
    
    window.map.on('mouseleave', 'road-extension-handles', () => {
      window.map.getCanvas().style.cursor = roadExtensionMode ? 'crosshair' : '';
    });
  } else {
    window.map.getSource('road-extension-handles').setData({
      type: 'FeatureCollection',
      features: handleFeatures
    });
  }
  
  console.log(`✅ Added ${roadExtensionHandles.length} road extension handles`);
}

/**
 * Remove road extension handles
 */
function removeRoadExtensionHandles() {
  roadExtensionHandles = [];
  
  if (!window.map) return;
  
  try {
    if (window.map.getLayer('road-extension-handles')) {
      window.map.removeLayer('road-extension-handles');
    }
    if (window.map.getSource('road-extension-handles')) {
      window.map.removeSource('road-extension-handles');
    }
  } catch (e) {
    console.log('🧹 Extension handles already removed');
  }
}

/**
 * Handle map clicks for road extension
 */
function onMapClickForRoadExtension(e) {
  if (!roadExtensionMode || !window.map) return;
  
  // Check if clicked on a road extension handle
  const features = window.map.queryRenderedFeatures(e.point, {
    layers: ['road-extension-handles']
  });
  
  if (features.length > 0) {
    // Clicked on a handle - start extending
    const handleId = features[0].properties.id;
    const handle = roadExtensionHandles.find(h => h.id === handleId);
    
    if (handle) {
      startRoadExtension(handle);
    }
  } else if (selectedRoadEndpoint && isExtending) {
    // Finish the extension
    finishRoadExtension(e.lngLat);
  }
}

/**
 * Handle mouse movement for road extension preview
 */
function onMouseMoveForRoadExtension(e) {
  if (!roadExtensionMode || !selectedRoadEndpoint || !isExtending) return;
  
  updateExtensionPreview(e.lngLat);
}

/**
 * Start extending a road from a specific endpoint
 */
function startRoadExtension(handle) {
  console.log(`🚀 Starting road extension from handle: ${handle.id}`);
  
  if (!window.map) {
    console.error('❌ Map not available for road extension');
    return;
  }
  
  selectedRoadEndpoint = handle;
  isExtending = true;
  
  // Create initial preview line
  const previewData = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [handle.coordinates, handle.coordinates]
    },
    properties: {
      type: 'extension-preview'
    }
  };
  
  // Add preview source and layer
  if (!window.map.getSource('road-extension-preview')) {
    window.map.addSource('road-extension-preview', {
      type: 'geojson',
      data: previewData
    });
    
    window.map.addLayer({
      id: 'road-extension-preview-line',
      type: 'line',
      source: 'road-extension-preview',
      paint: {
        'line-color': roadExtensionRules.previewColor,
        'line-width': 4,
        'line-dasharray': [2, 2],
        'line-opacity': 0.8
      }
    });
  } else {
    window.map.getSource('road-extension-preview').setData(previewData);
  }
  
  extensionPreview = previewData;
  
  console.log('✅ Road extension started - move mouse to preview');
}

/**
 * Update the extension preview line
 */
function updateExtensionPreview(endPoint) {
  if (!extensionPreview || !selectedRoadEndpoint || !window.map) return;
  
  const startCoord = selectedRoadEndpoint.coordinates;
  let endCoord = [endPoint.lng, endPoint.lat];
  
  // Apply angle snapping for cleaner layouts
  if (roadExtensionRules.snapAngle > 0) {
    endCoord = snapToAngle(startCoord, endCoord, roadExtensionRules.snapAngle);
  }
  
  // Update preview line
  extensionPreview.geometry.coordinates = [startCoord, endCoord];
  
  window.map.getSource('road-extension-preview').setData(extensionPreview);
  
  // Check for auto-branching
  const length = turf.distance(startCoord, endCoord, {units: 'meters'});
  
  // Show length indicator
  const lengthText = `${Math.round(length)}m`;
  if (length > roadExtensionRules.maxLength) {
    console.log(`⚠️ Road length (${lengthText}) exceeds max (${roadExtensionRules.maxLength}m) - branching will occur`);
  }
}

/**
 * Snap end coordinate to nearest angle increment
 */
function snapToAngle(startCoord, endCoord, snapDegrees) {
  const bearing = turf.bearing(startCoord, endCoord);
  const distance = turf.distance(startCoord, endCoord, {units: 'meters'});
  
  // Round bearing to nearest snap angle
  const snappedBearing = Math.round(bearing / snapDegrees) * snapDegrees;
  
  // Calculate new end point
  const snappedEndPoint = turf.destination(startCoord, distance, snappedBearing, {units: 'meters'});
  
  return snappedEndPoint.geometry.coordinates;
}

/**
 * Finish extending the road and apply branching rules
 */
function finishRoadExtension(endPoint) {
  if (!selectedRoadEndpoint || !isExtending) return;
  
  console.log('🏁 Finishing road extension');
  
  const startCoord = selectedRoadEndpoint.coordinates;
  let endCoord = [endPoint.lng, endPoint.lat];
  
  // Apply angle snapping
  if (roadExtensionRules.snapAngle > 0) {
    endCoord = snapToAngle(startCoord, endCoord, roadExtensionRules.snapAngle);
  }
  
  const length = turf.distance(startCoord, endCoord, {units: 'meters'});
  
  console.log(`📏 New road segment: ${Math.round(length)}m`);
  
  // Create the main extension road
  const mainRoad = createNewRoadSegment(startCoord, endCoord, 'ROAD_SECONDARY');
  newRoadsToAdd.push(mainRoad);
  
  // Apply auto-branching rules
  if (length > roadExtensionRules.maxLength) {
    console.log('🌳 Creating branch roads (length exceeded max)');
    
    const branchRoads = createBranchRoads(startCoord, endCoord);
    newRoadsToAdd.push(...branchRoads);
  }
  
  // Add the new roads to the map immediately
  addNewRoadsToMap();
  
  // Reset extension state
  isExtending = false;
  selectedRoadEndpoint = null;
  
  // Remove preview
  if (window.map && window.map.getSource('road-extension-preview')) {
    window.map.getSource('road-extension-preview').setData({
      type: 'FeatureCollection',
      features: []
    });
  }
  
  // Refresh handles to include new endpoint
  addRoadExtensionHandles();
  
  console.log('✅ Road extension completed');
}

/**
 * Create a new road segment GeoJSON feature
 */
function createNewRoadSegment(startCoord, endCoord, roadType = 'ROAD_SECONDARY') {
  return {
    type: 'Feature',
    properties: {
      Layer: roadType,
      generated: true,
      timestamp: Date.now()
    },
    geometry: {
      type: 'LineString',
      coordinates: [startCoord, endCoord]
    }
  };
}

/**
 * Create branch roads based on branching rules
 */
function createBranchRoads(startCoord, endCoord) {
  const branchRoads = [];
  const mainBearing = turf.bearing(startCoord, endCoord);
  const mainLength = turf.distance(startCoord, endCoord, {units: 'meters'});
  
  // Create branch at midpoint
  const midpoint = turf.midpoint(startCoord, endCoord);
  const midCoord = midpoint.geometry.coordinates;
  
  // Create perpendicular branches
  const leftBearing = mainBearing + roadExtensionRules.branchAngle;
  const rightBearing = mainBearing - roadExtensionRules.branchAngle;
  
  // Left branch
  const leftEndPoint = turf.destination(
    midCoord,
    roadExtensionRules.branchLength,
    leftBearing,
    {units: 'meters'}
  );
  
  const leftBranch = createNewRoadSegment(
    midCoord,
    leftEndPoint.geometry.coordinates,
    'ROAD_TERTIARY'
  );
  
  // Right branch
  const rightEndPoint = turf.destination(
    midCoord,
    roadExtensionRules.branchLength,
    rightBearing,
    {units: 'meters'}
  );
  
  const rightBranch = createNewRoadSegment(
    midCoord,
    rightEndPoint.geometry.coordinates,
    'ROAD_TERTIARY'
  );
  
  branchRoads.push(leftBranch, rightBranch);
  
  console.log(`🌿 Created ${branchRoads.length} branch roads at midpoint`);
  
  return branchRoads;
}

/**
 * Add new roads to the map as a separate layer
 */
function addNewRoadsToMap() {
  if (newRoadsToAdd.length === 0 || !window.map) return;
  
  console.log(`🗺️ Adding ${newRoadsToAdd.length} new roads to map`);
  
  // Create or update the generated roads source
  const roadsData = {
    type: 'FeatureCollection',
    features: newRoadsToAdd
  };
  
  if (!window.map.getSource('generated-roads')) {
    window.map.addSource('generated-roads', {
      type: 'geojson',
      data: roadsData
    });
    
    // Add main roads layer
    window.map.addLayer({
      id: 'generated-roads-main',
      type: 'line',
      source: 'generated-roads',
      filter: ['==', ['get', 'Layer'], 'ROAD_SECONDARY'],
      paint: {
        'line-color': roadExtensionRules.extensionColor,
        'line-width': 3,
        'line-opacity': 0.9
      }
    });
    
    // Add branch roads layer
    window.map.addLayer({
      id: 'generated-roads-branches',
      type: 'line',
      source: 'generated-roads',
      filter: ['==', ['get', 'Layer'], 'ROAD_TERTIARY'],
      paint: {
        'line-color': '#FF8C42',
        'line-width': 2,
        'line-opacity': 0.8
      }
    });
  } else {
    // Update existing source with all roads
    const existingData = window.map.getSource('generated-roads')._data;
    const allRoads = [...existingData.features, ...newRoadsToAdd];
    
    window.map.getSource('generated-roads').setData({
      type: 'FeatureCollection',
      features: allRoads
    });
  }
  
  // Clear the temporary array
  newRoadsToAdd = [];
}

/**
 * Commit all generated roads as permanent roads
 */
function commitNewRoads() {
  if (!window.map || !window.map.getSource('generated-roads')) return;
  
  const generatedData = window.map.getSource('generated-roads')._data;
  if (generatedData && generatedData.features.length > 0) {
    console.log(`💾 Committing ${generatedData.features.length} generated roads as permanent`);
    
    // These roads will now be included in extractRoadCenterlines()
    // and can be used for house generation
    
    // Optionally, you could integrate them into a permanent block here
  }
}

// Make functions globally available
window.toggleBlock3EditMode = toggleBlock3EditMode;
window.toggleRoadExtensionMode = toggleRoadExtensionMode;

// Make AI functions globally available
window.exportSiteAnalysisToDataFolder = exportSiteAnalysisToDataFolder;
window.checkSiteStatus = checkSiteStatus;
window.getCurrentSiteId = getCurrentSiteId;
window.updateSiteIdDisplay = updateSiteIdDisplay;

// Initialize site ID display on page load
updateSiteIdDisplay();

// Create a proper startApp function for the HTML to call
async function startApp() {
  if (window.appInitialized) {
    console.log('⚠️ App already initialized, skipping...');
    return;
  }

  // Await runtime config (with timeout safeguard)
  try {
    const configPromise = window.CONFIG_READY_PROMISE || Promise.resolve();
    await Promise.race([
      configPromise,
      new Promise(resolve => setTimeout(resolve, 1500)) // 1.5s max wait
    ]);
  } catch (e) {
    console.warn('Config promise issue:', e);
  }

  if (!window.MAPBOX_TOKEN) {
    console.warn('⚠️ MAPBOX_TOKEN still missing at startApp; proceeding may cause map init failure.');
  }

  console.log('🚀 Starting Masterplanning Tool...');

  initializeMap();
  initializeNavDropdown();
  initializeDrawMode();
  initializeGenerateHomesButton();
  initializeSiteNamePersistence();

  updateSiteIdDisplay();
  loadBlockData();

  window.appInitialized = true;
  console.log('✅ Application started successfully');
}

// Make startApp available globally
window.startApp = startApp;

// Legacy support - if no proper initialization is called, try to start anyway
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Only start if not already started by the new system
    if (!window.appStarted) {
      console.log('🔄 Fallback initialization...');
      startApp();
    }
  });
} else {
  // Only start if not already started
  if (!window.appStarted) {
    setTimeout(() => {
      if (!window.appStarted) {
        console.log('🔄 Immediate fallback initialization...');
        startApp();
      }
    }, 500);
  }
}