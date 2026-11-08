FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace=@kraken/server --ignore-scripts && npm cache clean --force
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY server/package.json ./package.json
COPY server/src ./src
COPY server/assets ./assets
USER node
EXPOSE 8080
CMD ["node","src/index.js"]
