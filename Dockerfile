FROM node:18-alpine
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm i --frozen-lockfile --prod

COPY index.js ./

ENTRYPOINT ["pnpm", "start"]