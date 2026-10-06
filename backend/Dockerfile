FROM node:24-alpine AS base
WORKDIR /app

FROM base AS migration
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["sh", "-c", "node ensure-database.js && npx node-pg-migrate up"]

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS runtime
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
CMD ["node", "index.js"]
