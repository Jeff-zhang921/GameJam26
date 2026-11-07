FROM oven/bun:1.3.11-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/check-dependencies.js ./scripts/check-dependencies.js
# Bun removes empty lockfiles, so reject dependency additions before installing.
RUN bun scripts/check-dependencies.js && bun install --ignore-scripts --no-save
COPY scripts ./scripts
COPY public ./public
COPY src ./src
RUN bun run build

FROM oven/bun:1.3.11-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY --from=build --chown=bun:bun /app/package.json ./package.json
COPY --chown=bun:bun server.js ./server.js
COPY --from=build --chown=bun:bun /app/src ./src
COPY --from=build --chown=bun:bun /app/dist ./dist
USER bun
EXPOSE 4173
CMD ["bun", "server.js"]
