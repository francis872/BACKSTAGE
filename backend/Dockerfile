FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm install --production

FROM base AS runtime
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
CMD ["node", "index.js"]
