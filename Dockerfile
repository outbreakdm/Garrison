# syntax=docker/dockerfile:1
# One Dockerfile, two images:
#   docker build --target bot -t garrison-bot .
#   docker build --target web -t garrison-web .
# Both run as the unprivileged "node" user and need no writable filesystem.

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
# Behind a TLS-inspecting proxy, pass its CA as a build secret:
#   docker build --secret id=ca,src=/path/to/ca.pem ...
# It's used only while downloading, and never stored in an image layer.
ARG PNPM_VERSION=10.28.0
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    corepack prepare pnpm@${PNPM_VERSION} --activate

# Install from the lockfile only, so this layer is cached until dependencies change.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/brand/package.json packages/brand/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# The dashboard build downloads its fonts (self-hosted after that), so it may need the CA too.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm --filter @garrison/bot build && pnpm --filter @garrison/web build
# Production dependencies for the bot only (workspace packages are bundled into dist).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm --filter @garrison/bot deploy --prod --legacy /out/bot && \
    cp -r apps/bot/dist /out/bot/dist && \
    rm -rf /out/bot/src /out/bot/tsconfig.json /out/bot/tsup.config.ts

# --- Bot: a long-running worker. No inbound ports except an optional health check.
FROM node:${NODE_VERSION} AS bot
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=root:root /out/bot ./
USER node
# Set HEALTH_PORT=8080 to enable GET /healthz.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD [ -z "$HEALTH_PORT" ] || wget -q -O /dev/null "http://127.0.0.1:${HEALTH_PORT}/healthz" || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]

# --- Dashboard: Next.js standalone server on port 3000.
FROM node:${NODE_VERSION} AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=root:root /repo/apps/web/.next/standalone ./
COPY --from=build --chown=root:root /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "apps/web/server.js"]
