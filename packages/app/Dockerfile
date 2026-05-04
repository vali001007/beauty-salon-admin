FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# 用 vendor-src/ 替代 ../../src（本目录内，无需跨目录）
ENV VITE_USE_VENDOR_SRC=true
RUN npm run build

FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["serve", "dist", "-s", "-l", "8080"]
