# Optimized multi-stage Dockerfile for Helios Next.js frontend
# Builder stage: install deps and build the app
FROM node:20-slim AS builder

WORKDIR /app

# Copy package manifests first to leverage Docker cache
COPY package*.json ./

# Install full deps for build
RUN npm ci --legacy-peer-deps

# Copy source and build (NEXT_PUBLIC_* env injected at build time)
COPY . .
RUN mkdir -p public
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:8000}
RUN npm run build


# Runtime stage: keep image small by installing only production deps
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Run the standalone server produced by Next. This avoids shipping the full
# development dependency tree in the runtime image.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Expose the standard Next.js port
EXPOSE 3000

# Start production server
CMD ["node", "server.js"]
