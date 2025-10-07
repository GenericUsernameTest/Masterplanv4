# Deployment

You can deploy this environment (Node data server + static frontend) in several ways.

## 1. Container Image (Recommended)
The repo includes a `Dockerfile` that serves the app on port 4000.

Build locally:
```
docker build -t masterplan:local .
docker run -p 4000:4000 masterplan:local
```
Visit: http://localhost:4000

### GitHub Container Registry (GHCR)
Push by committing to `main`. The GitHub Action at `.github/workflows/deploy.yml` automatically builds and publishes an image tagged with the commit SHA (and `latest` if configured). Find it under: `ghcr.io/<your-account>/<repo>`.

## 2. Render / Fly.io / Railway
Use the Docker deploy option or point the service to this repo. Set the start command to:
```
node data-server.js
```
Port: 4000 (the server listens on 4000).

## 3. GitHub Pages (Static Only)
GitHub Pages can only host static files; the `/save-analysis` API requires a server. You could host only the frontend there and point API calls to a separately deployed container (e.g., on Fly/Render). To do this, change the dynamic base URL logic in `exportSiteAnalysisToDataFolder` if needed to point to your API origin.

## 4. Environment Variables / Secrets
Runtime config now comes from `/config.js` when served by the Node server. Set env vars before starting:
```
MAPBOX_TOKEN=pk.yourtoken API_BASE=https://your-api-host node data-server.js
```
If `MAPBOX_TOKEN` is absent the fallback token (defined inline) is used. On GitHub Pages (static) it fetches `config.js` (will 404) and then falls back.

## 5. Verifying Deployment
After deploy, check:
```
curl -f https://<your-host>/ping
```
You should receive: `✅ Data server running`

Then open the site and draw a boundary; confirm a new `site-*-analysis.json` appears (or fetch `/analyses`).

## 6. Custom Domain
Point an A/AAAA or CNAME record to your hosting provider and ensure HTTPS (most platforms auto-provision certificates).

## 7. CI/CD Customizations
Adjust the GitHub Action to add caching, vulnerability scanning, or multi-arch builds as needed.

---
Feel free to request a Pages + external API split scaffold if you decide to go that route.
# 8. Repository Cleanup (Duplicate Directory Removal)
Previously a full duplicate application directory named `Generative Planner V4/` existed. It has been removed to prevent confusion and divergence. The active, canonical codebase is now only at the root (`index.html`, `js/`, `data-server.js`, `data/`, etc.). If you had uncommitted changes there, re-introduce them manually in the root structure.

# 9. Sharing a Public URL
You have two parts: the static frontend and the dynamic save API. To share with your team:

Option A: Single Hosted Server (simplest)
1. Deploy the container image (see Section 1) to a service (Render, Fly.io, Railway, Cloud Run, ECS, etc.).
2. Expose port 4000 → HTTPS. 
3. Share the resulting URL (e.g., `https://planner.example.com`). Both UI & saves work on same origin.

Option B: GitHub Pages (static) + External API
1. Keep GitHub Pages enabled for static assets: `https://<user>.github.io/<repo>/`.
2. Deploy the Node API elsewhere (e.g., `https://api-planner.example.com`).
3. Provide API base via:
	- Secret `API_BASE` in Actions (injected into `config.js`), or
	- Query parameter `?apiBase=https://api-planner.example.com`, or
	- Hardcoded assignment `window.API_BASE` before scripts.
4. Team visits Pages URL; boundary saves POST to external API.

Option C: Temporary Tunnel (demo)
1. Run locally: `node data-server.js`.
2. Start tunnel (`ngrok http 4000` → gives `https://xyz.ngrok.app`).
3. Share Page with `?apiBase=https://xyz.ngrok.app` or just send tunnel URL if serving UI locally only.

Recommended: Option A for lowest friction; Option B if you must keep frontend static & decoupled.

Verification Script:
```
curl -f https://planner.example.com/ping
curl -f https://api-planner.example.com/ping
```
Expect: `✅ Data server running`

If saves still download on Pages, open console to inspect candidate failures and ensure `API_BASE` resolves.
# Masterplanv4
# GitHub Pages Deployment

This repository includes a GitHub Actions workflow (`.github/workflows/pages.yml`) that publishes a static version of the app to GitHub Pages whenever you push to `main`.

Behavior differences on Pages:

### Enabling Remote Saves From Pages
Deploy the Node server (Docker image provided) to a host (Render/Fly/Cloud Run/etc.) and set in `index.html`:
```
<script>
	window.API_BASE = 'https://your-deployed-api.example.com';
</script>
```
When `window.API_BASE` is defined, even on GitHub Pages the app will POST to `${API_BASE}/save-analysis` instead of offline downloading.

#### Temporary / On-the-fly Override
You can also append a query parameter when testing on Pages:
```
https://<user>.github.io/<repo>/?apiBase=https://your-api-host
```
This value is persisted in `localStorage` (`API_BASE_OVERRIDE`). Remove it by running in the browser console:
```
localStorage.removeItem('API_BASE_OVERRIDE'); location.reload();
```

#### Using GitHub Pages Secrets for config.js
The Pages workflow can inject secrets into `dist/config.js`. Define repository Action secrets:

| Secret Name    | Purpose                                   |
|----------------|--------------------------------------------|
| MAPBOX_TOKEN   | Mapbox access token (omit to use fallback) |
| API_BASE       | Remote API base (e.g. https://api.example) |

Add them in: Settings → Secrets and variables → Actions. On deployment the workflow writes:
```
window.RUNTIME_CONFIG = { MAPBOX_TOKEN: <secret>, API_BASE: <secret>, GENERATED_AT: <timestamp> };
```
If secrets are empty the client falls back to offline mode.

To enable Pages:
1. Open Repository Settings → Pages.
2. Under Build and deployment, choose GitHub Actions (the workflow will appear automatically after first successful run).
3. After deployment, visit: `https://<your-username>.github.io/<repo-name>/`.

If you later deploy an external API (e.g., Render/Fly), update the GitHub Pages detection block to point to that API base instead of offline mode.
