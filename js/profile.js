/**
 * Profile Page JavaScript  
 * Handles saved sites display, deletion, and navigation with ID-based system
 */

/**
 * Load and display saved sites from localStorage
 */
function loadSavedSites() {
  let savedSites = JSON.parse(localStorage.getItem("savedSites") || "[]");
  
  // Migration: Add IDs to existing sites that don't have them
  let needsMigration = false;
  savedSites.forEach(site => {
    if (!site.id) {
      site.id = `site-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      needsMigration = true;
      console.log("🔄 Migrated site to have ID:", site.name, "->", site.id);
    }
  });
  
  if (needsMigration) {
    localStorage.setItem("savedSites", JSON.stringify(savedSites));
    console.log("✅ Migration complete - all sites now have IDs");
  }
  
  const container = document.getElementById("saved-sites");
  
  console.log("📋 loadSavedSites called, found", savedSites.length, "sites");
  console.log("Sites:", savedSites.map(s => ({ id: s.id, name: s.name, hasId: !!s.id })));
  
  if (!container) {
    console.error("❌ No #saved-sites container found");
    return;
  }
  
  container.innerHTML = "";

  if (!savedSites.length) {
    container.innerHTML = "<p>No saved sites yet.</p>";
    return;
  }

  savedSites.forEach(site => {
    console.log("🏗️ Creating card for site:", site.name, "ID:", site.id);
    
    const item = document.createElement("div");
    item.className = "site-card";
    
    const lastModified = site.lastModified || site.timestamp || new Date().toISOString();
    
    item.innerHTML = `
      <h3>${site.name}</h3>
      <p>ID: ${site.id || 'NO ID'}</p>
      <p>Last modified: ${new Date(lastModified).toLocaleString()}</p>
      <div class="site-actions">
        <button onclick="openSite('${site.id}')" class="open-btn">Open</button>
        <button onclick="deleteSite('${site.id}')" class="delete-btn">Delete</button>
      </div>
    `;
    container.appendChild(item);
  });
}

/**
 * Open a site by navigating to its URL
 * @param {string} siteId - The ID of the site to open
 */
function openSite(siteId) {
  console.log("🚀 openSite called with ID:", siteId);
  
  // Verify the site exists
  const savedSites = JSON.parse(localStorage.getItem("savedSites") || "[]");
  const site = savedSites.find(s => s.id === siteId);
  
  if (!site) {
    console.error("❌ Site not found:", siteId);
    console.log("Available sites:", savedSites.map(s => ({ id: s.id, name: s.name })));
    alert("Site not found!");
    return;
  }
  
  console.log("✅ Found site to open:", site.name);
  
  // Navigate directly to the site URL using URL parameters
  console.log("🌐 Navigating to site URL:", `index.html?site=${siteId}`);
  window.location.href = `index.html?site=${siteId}`;
}

/**
 * Delete a site with confirmation
 * @param {string} siteId - The ID of the site to delete
 */
function deleteSite(siteId) {
  const savedSites = JSON.parse(localStorage.getItem("savedSites") || "[]");
  const site = savedSites.find(s => s.id === siteId);
  
  if (!site) {
    console.error("Site not found:", siteId);
    return;
  }
  
  const confirmed = confirm(`Are you sure you want to delete "${site.name}"?\n\nThis action cannot be undone.`);
  if (!confirmed) return;
  
  const filteredSites = savedSites.filter(s => s.id !== siteId);
  localStorage.setItem("savedSites", JSON.stringify(filteredSites));
  
  console.log("Deleted site:", site.name);
  
  // Reload the sites display
  loadSavedSites();
}

/**
 * Create a new site and navigate to index (world view)
 */
function createNewSite() {
  // Clear any lingering site data
  localStorage.removeItem("activeSiteId");
  localStorage.removeItem("siteBoundary");
  localStorage.removeItem("siteName");
  
  console.log("Creating new site - navigating to world view");
  // Navigate to home page (no site parameter = world view)
  window.location.href = "index.html";
}

// Make functions globally available
window.loadSavedSites = loadSavedSites;
window.openSite = openSite;
window.deleteSite = deleteSite;
window.createNewSite = createNewSite;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", loadSavedSites);