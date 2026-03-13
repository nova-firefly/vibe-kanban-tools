FROM node:20-alpine AS base

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Download vibe-kanban-mcp binary ──────────────────────────────────────────
# Runs the npm wrapper once so it downloads and caches the MCP binary, then we
# copy the result out. The wrapper reads VIBE_KANBAN_MCP_BINARY_TAG if set.
FROM base AS mcp-binary
WORKDIR /app
RUN npm install -g vibe-kanban 2>/dev/null || true
# Trigger the download by importing the download helper directly
RUN node -e " \
  const {ensureBinary} = require('/usr/local/lib/node_modules/vibe-kanban/bin/download'); \
  ensureBinary('vibe-kanban-mcp') \
    .then(() => process.exit(0)) \
    .catch(e => { console.error(e); process.exit(1); }); \
"
# Find the downloaded binary and copy to a stable path
RUN find /root/.vibe-kanban -name 'vibe-kanban-mcp' -not -name '*.zip' \
      -exec cp {} /usr/local/bin/vibe-kanban-mcp \; && \
    chmod +x /usr/local/bin/vibe-kanban-mcp

# ── Build Next.js app ─────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy MCP binary from the dedicated stage
COPY --from=mcp-binary /usr/local/bin/vibe-kanban-mcp /usr/local/bin/vibe-kanban-mcp

COPY --from=builder /app/public* ./public/
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
