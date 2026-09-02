FROM node:22.12-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY apps/api ./apps/api
COPY apps/generation-worker ./apps/generation-worker
COPY packages ./packages
RUN npm run build:api

FROM node:22.12-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data/objects && chown -R node:node /app/data
USER node
EXPOSE 4000
CMD ["node", "/app/dist/apps/api/src/server.js"]
