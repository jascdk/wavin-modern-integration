# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 15000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER app
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/index.js"]
