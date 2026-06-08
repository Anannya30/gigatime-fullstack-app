# ---- Stage 1: build the Vite/React bundle ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the source and produce the production build.
COPY . .
RUN npm run build

# ---- Stage 2: serve the static bundle with NGINX ----
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
