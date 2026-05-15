FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install --no-audit --no-fund --prefix packages/contracts
RUN npm install --no-audit --no-fund --prefix apps/web
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build --prefix packages/contracts
RUN npm run build --prefix apps/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
