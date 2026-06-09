# FinFolio — single image: builds the web SPA and runs the Fastify API (via tsx),
# which also serves the built SPA (WEB_STATIC_DIR). No turbo, no shared packages.
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
# Workspace manifests first for cached installs.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
# Build the web SPA (Vite). VITE_API_BASE_URL is baked at build time.
ARG VITE_API_BASE_URL=/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
RUN pnpm --filter @finfolio/web build

# Runtime reuses the build stage (the API runs via tsx, so it needs the full
# workspace deps + source — there is no compiled API dist).
FROM build AS runtime
ENV NODE_ENV=production
# The API serves the built SPA from here (see app.ts).
ENV WEB_STATIC_DIR=/app/apps/web/dist
EXPOSE 3000
CMD ["pnpm", "--filter", "@finfolio/api", "start"]
