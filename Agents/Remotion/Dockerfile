FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src
COPY fonts ./fonts

RUN npm install --no-audit --no-fund
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY --from=build /app/fonts ./fonts

EXPOSE 3000

CMD ["node", "dist/server.js"]


