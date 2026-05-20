# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24.15.0

############################################
# Builder
############################################
FROM node:${NODE_VERSION}-alpine AS builder

# CI=true lets pnpm prune devDeps non-interactively (no TTY in BuildKit).
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

# Copy lockfiles + manifests first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/demo-cli/package.json apps/demo-cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/adapter-ollama/package.json packages/adapter-ollama/package.json
COPY packages/adapter-openai-compatible/package.json packages/adapter-openai-compatible/package.json
COPY packages/adapter-anthropic/package.json packages/adapter-anthropic/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile --ignore-scripts

# Copy source and build
COPY tsconfig.base.json tsconfig.json nx.json ./
COPY packages packages
COPY apps/demo-cli apps/demo-cli

RUN pnpm exec nx run-many --target=build \
    --projects=core,adapter-ollama,adapter-openai-compatible,adapter-anthropic,demo-cli

# Prune dev dependencies for runtime
RUN --mount=type=cache,id=pnpm,target=/pnpm-store \
    pnpm install --frozen-lockfile --prod --ignore-scripts

############################################
# Runtime
############################################
FROM node:${NODE_VERSION}-alpine AS runtime

RUN apk add --no-cache tini

WORKDIR /app
USER node

COPY --from=builder --chown=node:node /workspace/apps/demo-cli/dist ./dist
COPY --from=builder --chown=node:node /workspace/apps/demo-cli/package.json ./package.json
COPY --from=builder --chown=node:node /workspace/packages ./packages
COPY --from=builder --chown=node:node /workspace/node_modules ./node_modules

ENV NODE_ENV=production

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.cjs"]
