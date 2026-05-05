FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @pdi/contracts build
RUN pnpm --filter @pdi/api prisma:generate
RUN pnpm --filter @pdi/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3333
CMD ["node", "dist/server.js"]
