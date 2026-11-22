# Imagen de servidor de APPINITY (API y worker comparten imagen; cambia el comando).
# Solo backend: la app móvil se compila aparte con EAS. Sin secretos en la imagen: todo llega por variables de entorno.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY workers/sync-worker/package.json workers/sync-worker/
COPY packages/algorithms/package.json packages/algorithms/
COPY packages/catalog/package.json packages/catalog/
COPY packages/database/package.json packages/database/
COPY packages/i18n/package.json packages/i18n/
COPY packages/ingestion/package.json packages/ingestion/
COPY packages/integrations/package.json packages/integrations/
COPY packages/shared/package.json packages/shared/
# Se excluye la app móvil (React Native): el servidor no la necesita.
RUN pnpm install --frozen-lockfile --filter "!@appinity/mobile"
COPY apps/api apps/api
COPY workers workers
COPY packages packages
RUN pnpm build && pnpm prune --prod --filter "!@appinity/mobile" || true

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S appinity && adduser -S appinity -G appinity
COPY --from=build --chown=appinity:appinity /app /app
USER appinity
EXPOSE 3100
# Por defecto, la API. El worker usa: node workers/sync-worker/dist/main.js · migraciones: node packages/database/dist/cli/migrate.js
CMD ["node", "apps/api/dist/main.js"]
