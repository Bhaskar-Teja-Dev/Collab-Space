# ─── Multi-Stage Dockerfile for CollabSpace Server ───────────────────────────

# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Install openssl for Prisma generation
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy lockfiles and workspace package definitions
COPY package*.json ./
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/

# Install all dependencies
RUN npm ci

# Copy source code
COPY shared/ ./shared/
COPY server/ ./server/

# Generate Prisma Client
RUN npm run db:generate --workspace=server

# Build TypeScript projects
RUN npm run build --workspace=shared
RUN npm run build --workspace=server

# Stage 2: Runner
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install openssl runtime dependency
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy built outputs and node_modules
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/package*.json ./shared/
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma

# Expose server port
EXPOSE 3001
ENV PORT=3001

# Run database migrations and start server
CMD ["node", "server/dist/index.js"]
