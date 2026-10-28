# Guildie's realtime rooms, as a small container for the droplet (docs/realtime-setup.md).
# Built and pushed to ghcr.io/marcialpimentel/guildie-realtime by .github/workflows/deploy.yml.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
USER node
ENV PORT=8788
EXPOSE 8788
CMD ["node", "src/server.mjs"]
