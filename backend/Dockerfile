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
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm run prisma:generate
# Build the approved registry, including explicitly approved health-only scaffolds.
# Copy each artifact before the next build can clear dist.
RUN node --input-type=module <<'JS'
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { services } = JSON.parse(fs.readFileSync('deploy/production/services.json', 'utf8'));
for (const [name, service] of Object.entries(services)) {
  if (!service.deploy) continue;
  if (service.state === 'NOT_READY') throw new Error(`NOT_READY: ${name}`);
  execFileSync('pnpm', ['exec', 'nest', 'build', name], { stdio: 'inherit' });
  fs.mkdirSync(`/artifacts/apps/${name}`, { recursive: true });
  fs.copyFileSync(`dist/apps/${name}/main.js`, `/artifacts/apps/${name}/main.js`);
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
    && cp -a node_modules/@prisma/user-trust-client /user-trust-client \
    && cp -a node_modules/@prisma/notification-client /notification-client \
    && pnpm prune --prod \
    && cp -a /auth-client node_modules/@prisma/auth-client \
    && cp -a /user-trust-client node_modules/@prisma/user-trust-client \
    && cp -a /notification-client node_modules/@prisma/notification-client

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
