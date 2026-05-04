# 从仓库根目录构建，packages/app 的 vite 需要访问 ../../src（主项目 API/types/stores）
FROM node:20-alpine AS builder
WORKDIR /repo

# 先复制主项目依赖文件（利用 Docker 层缓存）
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# 再复制 web app 依赖文件
COPY packages/app/package.json packages/app/package-lock.json ./packages/app/
RUN npm install --legacy-peer-deps --prefix packages/app

# 复制全部源码（主项目 src/ 和 packages/app/src/ 都需要）
COPY src/ ./src/
COPY packages/app/ ./packages/app/

# 构建 web app
RUN npm run build --prefix packages/app

FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=builder /repo/packages/app/dist ./dist
EXPOSE 8080
CMD ["serve", "dist", "-s", "-l", "8080"]
