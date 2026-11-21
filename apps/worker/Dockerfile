# Build from the repo root:  docker build -f apps/worker/Dockerfile -t ethio-worker .
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @ethio/worker...
COPY packages packages
COPY apps/worker apps/worker
RUN pnpm --filter @ethio/worker... build \
 && pnpm --filter @ethio/worker deploy --prod --legacy /out \
 && cp -r packages/db/prisma /out/prisma

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
RUN npx --yes prisma@6.19.3 generate --schema prisma/schema.prisma
USER node
CMD ["node", "dist/main.js"]
