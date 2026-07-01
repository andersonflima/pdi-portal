FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY tsconfig.base.json ./
COPY app/api/package.json app/api/package.json
COPY app/web/package.json app/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install --no-audit --no-fund --prefix packages/contracts
RUN npm install --no-audit --no-fund --prefix app/api
RUN npm install --no-audit --no-fund --prefix app/web

FROM deps AS build
COPY scripts scripts
COPY packages/contracts packages/contracts
COPY app/api app/api
COPY app/web app/web
RUN npm run build --prefix packages/contracts
RUN npm run build --prefix app/web
RUN cp -R app/web/dist app/api/public
RUN npm run build --prefix app/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/app/api ./app/api
WORKDIR /app/app/api
EXPOSE 3333
CMD ["node", "dist/server.js"]
