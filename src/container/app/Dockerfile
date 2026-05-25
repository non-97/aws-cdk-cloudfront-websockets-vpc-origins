FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --prod --no-frozen-lockfile

COPY server.mjs index.html ./

EXPOSE 8080

CMD ["node", "server.mjs"]
