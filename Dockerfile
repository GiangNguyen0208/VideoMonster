# syntax=docker/dockerfile:1.7
#
# OpenMontage: Backlot server + Studio UI (+ the tool runtimes the agent uses).
# Build:  docker build -t openmontage .
# Run:    docker compose up --build   (see docker-compose.yml)

ARG PYTHON_VERSION=3.11
ARG NODE_VERSION=22

# ---- 1. Build the Studio SPA (studio/dist) ---------------------------------
FROM node:${NODE_VERSION}-slim AS studio-build
WORKDIR /studio
COPY studio/package.json studio/package-lock.json ./
RUN npm ci
COPY studio/ ./
RUN npm run build

# ---- 2. Runtime ------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime

ARG INSTALL_REMOTION=1
ARG UID=1000

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    BACKLOT_HOST=0.0.0.0 \
    BACKLOT_PORT=4750

# ffmpeg for every video/audio tool; the rest are Chrome's shared libraries,
# which Remotion's headless browser needs to render.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl git fonts-liberation \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
      libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
      libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*

# Node for Remotion and HyperFrames (same major as .node-version).
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /app

COPY requirements.txt ./
RUN pip install --upgrade 'pip>=26.2.2' \
 && pip install -r requirements.txt \
 && (pip install piper-tts || echo "piper-tts skipped: TTS falls back to cloud providers")

COPY remotion-composer/package.json remotion-composer/package-lock.json remotion-composer/
RUN if [ "$INSTALL_REMOTION" = "1" ]; then cd remotion-composer && npm ci; fi

COPY . .
COPY --from=studio-build /studio/dist studio/dist

RUN useradd --create-home --uid "$UID" app \
 && mkdir -p projects music_library .backlot \
 && chown -R app:app /app
USER app

# Remotion fetches its headless Chrome on first use; do it now so renders work offline.
RUN if [ "$INSTALL_REMOTION" = "1" ]; then cd remotion-composer && npx remotion browser ensure || true; fi

EXPOSE 4750
VOLUME ["/app/projects", "/app/music_library", "/app/.backlot"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import os,urllib.request as u; u.urlopen(f'http://127.0.0.1:{os.environ.get(\"BACKLOT_PORT\",4750)}/api/health', timeout=3)"

CMD ["python", "-m", "backlot", "serve"]
