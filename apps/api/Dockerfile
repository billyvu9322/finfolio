# FinFolio API — runs via tsx (no build step at MVP scaffold stage).
FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json ./
RUN pnpm install --prod=false

COPY . .

EXPOSE 3000
CMD ["pnpm", "start"]
