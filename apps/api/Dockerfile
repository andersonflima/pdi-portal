FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM deps AS build
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build --workspace @pdi/contracts
RUN npm run prisma:generate --workspace @pdi/api
RUN npm run build --workspace @pdi/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3333
CMD ["node", "dist/server.js"]
