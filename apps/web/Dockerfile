# Build the SPA, then serve static files with nginx.
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json ./
RUN pnpm install
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
