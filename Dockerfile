FROM node:20-slim AS build

RUN apt-get update && apt-get install -y \
    build-essential \
    make \
    gcc \
    g++ \
    python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY package.json yarn.lock ./
RUN yarn --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN yarn build

FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    wget \
    openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Install signal-cli
RUN wget -O /tmp/signal-cli.tar.gz \
    "https://github.com/AsamK/signal-cli/releases/download/v0.12.5/signal-cli-0.12.5.tar.gz" \
    && tar -xzf /tmp/signal-cli.tar.gz -C /opt \
    && ln -s /opt/signal-cli-0.12.5/bin/signal-cli /usr/bin/signal-cli \
    && rm /tmp/signal-cli.tar.gz

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /build/build ./build
COPY --from=build /build/node_modules ./node_modules
COPY config ./config

VOLUME ["/data"]
EXPOSE 9005

CMD ["node", "build/src/main.js", "-c", "/data/config.yaml"]
