FROM node:24-alpine

RUN apk add --no-cache curl \
  && curl -fsSL https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 \
     -o /usr/local/bin/supercronic \
  && chmod +x /usr/local/bin/supercronic

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

# Default: run once (override in docker-compose for cron)
CMD ["node", "dist/index.js", "send", "--format", "epub"]
