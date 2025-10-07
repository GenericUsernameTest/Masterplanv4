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
Currently the Mapbox token is embedded inline. For production, move it to an environment variable and inject at build or runtime (e.g., serve a small `/config.js`).

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
# Masterplanv4