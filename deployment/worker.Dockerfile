FROM node:24-bookworm-slim AS node
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 libatomic1 tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --omit=dev --prefix backend --ignore-scripts && npm cache clean --force
COPY bsie/requirements.txt ./bsie/requirements.txt
COPY sanitary/requirements.txt ./sanitary/requirements.txt
RUN pip install --no-cache-dir -r sanitary/requirements.txt
COPY backend ./backend
COPY shared ./shared
COPY bsie ./bsie
COPY sanitary ./sanitary
RUN useradd --uid 10001 --create-home backstage
ENV NODE_ENV=production BSIE_PYTHON=/usr/local/bin/python PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PROJ_NETWORK=OFF
USER backstage
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "backend/scripts/computational-worker.js"]
