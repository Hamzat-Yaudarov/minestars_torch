#!/usr/bin/env bash
set -e
cd apps/minestarstorch
if [ -f package-lock.json ]; then
  npm ci --omit=dev || npm ci
else
  npm install --omit=dev || npm install
fi
node src/server.js
