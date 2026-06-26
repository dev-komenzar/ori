# ori CI smoke base image.
#
# Provides the toolchain needed to drive the deterministic, script-level parts
# of `/ori-flow` non-interactively (see ci/smoke/run-smoke.sh). Used by the
# `dod-smoke` GitHub Actions workflow and reproducible locally with:
#
#   docker build -t ori-smoke -f ci/smoke/Dockerfile .
#   docker run --rm -v "$PWD":/workspace ori-smoke
#
# Pinned tool versions (kept in sync with engines/devDependencies in the host repo):
#   node     22.x       (matches actions/setup-node@v4 with node-version: 22)
#   pnpm     10.x       (matches packageManager hint in package.json)
#   rustup   stable     (cargo needed by install-tauri-scaffold.sh::add_cargo_deps)
#   tauri-cli 2.x       (matches the typescript-tauri stack template)

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

# System deps:
#   - build-essential / pkg-config / libssl-dev : tauri-cli build (openssl-sys)
#   - libgtk-3-dev / libwebkit2gtk-4.1-dev / libsoup-3.0-dev / libjavascriptcoregtk-4.1-dev
#       : tauri 2 linux runtime headers (needed if cargo check expands tauri deps)
#   - git / curl / ca-certificates : rustup install + actions/checkout fallback
#   - jq : run-smoke.sh assertions
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      git \
      jq \
      libgtk-3-dev \
      libjavascriptcoregtk-4.1-dev \
      libsoup-3.0-dev \
      libssl-dev \
      libwebkit2gtk-4.1-dev \
      pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Rust toolchain (stable). Pinned channel — bump deliberately.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --default-toolchain stable --profile minimal \
    && rustup --version \
    && cargo --version \
    && rustc --version

# pnpm via corepack (no network race vs `npm i -g`).
RUN corepack enable \
    && corepack prepare pnpm@10.33.4 --activate \
    && pnpm --version

# tauri-cli (binary). `cargo install` would compile from source which is slow
# and pulls a long dep tree; the npm wrapper is what `pnpm tauri ...` uses
# anyway.
RUN npm install -g @tauri-apps/cli@^2 \
    && tauri --version

WORKDIR /workspace

# Default to the smoke driver. Override with `docker run ... bash` for poking.
CMD ["bash", "ci/smoke/run-smoke.sh"]
