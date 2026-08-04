FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-alpine AS runner

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV BRAIN_ACTION_EXECUTION_ENABLED=false
ENV BRAIN_LLM_PRIMARY_ROUTE=fallback
ENV ASK_DATA_FREE_SQL_ENABLED=false
EXPOSE 8080

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://localhost:${PORT:-8080}/api/health" || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
