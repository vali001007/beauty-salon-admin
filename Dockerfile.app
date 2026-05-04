FROM node:20-alpine AS builder
WORKDIR /repo

# 主项目依赖
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# web app 依赖
COPY packages/app/package.json ./packages/app/
RUN npm install --legacy-peer-deps --prefix packages/app

# 源码（主项目 src/ 供 vite alias @ 使用，packages/app/ 是 web app 本体）
COPY src ./src
COPY packages/app ./packages/app

RUN npm run build --prefix packages/app

FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=builder /repo/packages/app/dist ./dist
EXPOSE 8080
CMD ["serve", "dist", "-s", "-l", "8080"]
