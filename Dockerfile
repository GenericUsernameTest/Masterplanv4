# Multi-stage build not strictly necessary (no build step), keep simple
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package manifest (root)
COPY package.json package-lock.json* ./

# Install production deps only
RUN npm install --omit=dev || npm install --only=prod

# Copy rest of application
COPY . .

# Expose port
EXPOSE 4000

# Healthcheck (simple ping)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:4000/ping || exit 1

# Start server
CMD ["node", "data-server.js"]
