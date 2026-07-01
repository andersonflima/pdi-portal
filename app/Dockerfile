FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY tsconfig.base.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install --no-audit --no-fund --prefix packages/contracts
RUN npm install --no-audit --no-fund --prefix api
RUN npm install --no-audit --no-fund --prefix web

FROM deps AS build
COPY scripts scripts
COPY packages/contracts packages/contracts
COPY api api
COPY web web
RUN npm run build --prefix packages/contracts
RUN npm run build --prefix web
RUN cp -R web/dist api/public
RUN npm run build --prefix api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/api ./api
WORKDIR /app/api
EXPOSE 3333
CMD ["node", "dist/server.js"]
