FROM node:20-bookworm-slim AS build

WORKDIR /app

# System deps for native Node modules (canvas) and Python venv
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    build-essential pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

# Install Node dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy the full repo (includes Agents/ and scripts/)
COPY . .

# Build backend TypeScript
RUN npm run build

# Ensure agent venv exists inside the image (deterministic runtime)
RUN chmod +x scripts/setup-product-showcase-agent.sh && npm run setup:agent

# Runtime image
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Minimal runtime deps: python3 + venv to run the agent process
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/Agents ./Agents
COPY --from=build /app/scripts ./scripts

# Ensure writable folders exist
RUN mkdir -p /app/generated-images /app/temp-uploads

EXPOSE 8080

CMD ["npm", "start"]
