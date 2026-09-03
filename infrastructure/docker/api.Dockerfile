FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json .eslintrc.cjs ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY docs/openapi.yaml docs/openapi.yaml
RUN npm run build -w @cloudops/shared && npm run build -w @cloudops/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json
COPY --from=deps /app/package.json ./package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY docs/openapi.yaml ./docs/openapi.yaml
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
