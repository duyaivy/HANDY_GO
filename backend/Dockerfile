# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/pnpm/corepack
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@10.17.1 --activate

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY . .
# Placeholder is for Prisma config parsing only. No database is contacted during build.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    DATABASE_URL_MESSAGE=postgresql://build:build@localhost:5432/build \
    pnpm run prisma:generate
# Build the approved registry, including explicitly approved health-only scaffolds.
# Copy each artifact before the next build can clear dist.
RUN node --input-type=module <<'JS'
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { services } = JSON.parse(fs.readFileSync('deploy/production/services.json', 'utf8'));
for (const [name, service] of Object.entries(services)) {
  if (!service.deploy) continue;
  if (service.state === 'NOT_READY') throw new Error(`NOT_READY: ${name}`);
  if (name === 'message-service') {
    execFileSync('pnpm', ['run', 'build:message'], { stdio: 'inherit' });
    fs.mkdirSync('/artifacts/message-runtime', { recursive: true });
    fs.cpSync('dist/message-runtime', '/artifacts/message-runtime', { recursive: true });
  } else {
    execFileSync('pnpm', ['exec', 'nest', 'build', name], { stdio: 'inherit' });
    fs.mkdirSync(`/artifacts/apps/${name}`, { recursive: true });
    fs.copyFileSync(`dist/apps/${name}/main.js`, `/artifacts/apps/${name}/main.js`);
  }
}
JS

# One-shot migration tooling, pulled only for the machine owning the migration.
FROM build AS migration
ENV COREPACK_ENABLE_NETWORK=0
USER node
# Confirm the runtime user can use the preloaded package manager without network access.
RUN pnpm --version
CMD ["pnpm", "run", "prisma:migrate"]

FROM build AS production-dependencies
# Preserve non-package generated clients across pnpm prune.
RUN cp -a node_modules/@prisma/auth-client /auth-client \
    && cp -a node_modules/@prisma/bidding-client /bidding-client \
    && cp -a node_modules/@prisma/matching-client /matching-client \
    && cp -a node_modules/@prisma/message-client /message-client \
    && cp -a node_modules/@prisma/notification-client /notification-client \
    && cp -a node_modules/@prisma/order-client /order-client \
    && cp -a node_modules/@prisma/payment-client /payment-client \
    && cp -a node_modules/@prisma/tracking-client /tracking-client \
    && cp -a node_modules/@prisma/user-trust-client /user-trust-client \
    && cp -a node_modules/@prisma/wallet-client /wallet-client \
    && pnpm prune --prod \
    && cp -a /auth-client node_modules/@prisma/auth-client \
    && cp -a /bidding-client node_modules/@prisma/bidding-client \
    && cp -a /matching-client node_modules/@prisma/matching-client \
    && cp -a /message-client node_modules/@prisma/message-client \
    && cp -a /notification-client node_modules/@prisma/notification-client \
    && cp -a /order-client node_modules/@prisma/order-client \
    && cp -a /payment-client node_modules/@prisma/payment-client \
    && cp -a /tracking-client node_modules/@prisma/tracking-client \
    && cp -a /user-trust-client node_modules/@prisma/user-trust-client \
    && cp -a /wallet-client node_modules/@prisma/wallet-client

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /artifacts ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node libs/common/src/templates/template.html ./libs/common/src/templates/template.html
COPY --chown=node:node deploy/production/verify.mjs ./ops/verify.mjs
USER node
CMD ["node", "dist/apps/api-gateway/main.js"]
