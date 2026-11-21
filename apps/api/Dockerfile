# Build from the repo root:  docker build -f apps/api/Dockerfile -t ethio-api .
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @ethio/api...
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @ethio/api... build \
 && pnpm --filter @ethio/api deploy --prod --legacy /out \
 && cp -r packages/db/prisma /out/prisma

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
# Prisma client is generated in the build stage; regenerate against the runtime's node_modules layout.
RUN npx --yes prisma@6.19.3 generate --schema prisma/schema.prisma
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/main.js"]
