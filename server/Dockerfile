# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
COPY sql ./sql
RUN npm ci
RUN npm run build

FROM base AS prod-deps
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=deps /app/dist ./dist
COPY package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/index.js"]
