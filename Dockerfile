FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files for Docker deployment
COPY package-docker.json package.json
COPY package-lock.json* ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY server.js .
COPY http-server.js .
COPY README.md .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001
USER nodeuser

# Expose port 5000 (matches your current server setup)
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the HTTP server by default (can be overridden for stdio mode)
CMD ["npm", "start"]