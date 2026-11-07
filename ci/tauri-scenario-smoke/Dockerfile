# ori tauri scenario CI smoke image (ori-7c1).
#
# tauri (local mode) scenario の headless WDIO 実行に必要な一式:
#   WebKitGTK dev 系 (tauri build) + WebKitWebDriver (webkit2gtk-driver) + xvfb + tauri-driver
# 参照: https://tauri.app/develop/tests/webdriver/ci/
#
# Used by .github/workflows/tauri-scenario-smoke.yml. Reproduce locally with:
#
#   docker build -t ori-tauri-smoke -f ci/tauri-scenario-smoke/Dockerfile ci/tauri-scenario-smoke
#   docker run --rm -v "$PWD":/workspace ori-tauri-smoke
#
# Pinned tool versions (bump deliberately):
#   node          22.x (bookworm)
#   pnpm          10.33.x (root package.json の packageManager と揃える)
#   rust          stable (minimal profile)
#   tauri-driver  TAURI_DRIVER_VERSION

FROM node:22-bookworm

ARG TAURI_DRIVER_VERSION=2.0.6
ARG PNPM_VERSION=10.33.2

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

# System deps:
#   - libwebkit2gtk-4.1-dev / libgtk-3-dev / libsoup-3.0-dev / libssl-dev / librsvg2-dev
#     / build-essential / pkg-config / file : tauri 2 linux build
#   - webkit2gtk-driver : WebKitWebDriver (tauri-driver の native driver)
#   - xvfb : headless X display (xvfb-run)
#   - dbus-x11 / at-spi2-core : WebKitGTK が起動時に session bus / a11y bus を探すため
RUN apt-get update && apt-get install -y --no-install-recommends \
      at-spi2-core \
      build-essential \
      ca-certificates \
      curl \
      dbus-x11 \
      file \
      git \
      libgtk-3-dev \
      librsvg2-dev \
      libsoup-3.0-dev \
      libssl-dev \
      libwebkit2gtk-4.1-dev \
      pkg-config \
      webkit2gtk-driver \
      xauth \
      xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && command -v WebKitWebDriver

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --default-toolchain stable --profile minimal \
    && cargo --version \
    && cargo install tauri-driver --locked --version "$TAURI_DRIVER_VERSION" \
    && rm -rf "$CARGO_HOME/registry" \
    && command -v tauri-driver

RUN corepack enable \
    && corepack prepare "pnpm@$PNPM_VERSION" --activate \
    && pnpm --version

WORKDIR /workspace

CMD ["bash", "ci/tauri-scenario-smoke/run-smoke.sh"]
