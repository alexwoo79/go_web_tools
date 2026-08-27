#!/usr/bin/env bash
# 构建 Vue 前端并把产物同步到 ui/frontend（Go 内嵌目录）。
# 桌面端（wails build）与 Web 端（build.sh）共用该步骤，避免内嵌前端过期。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/vue-form"
EMBED_DIR="$ROOT_DIR/ui/frontend"

if [ ! -d "$FRONTEND_DIR/node_modules" ] || ! (cd "$FRONTEND_DIR" && npm ls --depth=0 >/dev/null 2>&1); then
	echo "[sync] 安装 Vue 前端依赖..."
	cd "$FRONTEND_DIR"
	npm ci
fi

echo "[sync] 构建 Vue 前端..."
cd "$FRONTEND_DIR"
npm run build

echo "[sync] 同步 dist 到 ui/frontend..."
rm -rf "$EMBED_DIR"/*
cp -R "$FRONTEND_DIR"/dist/* "$EMBED_DIR"/

echo "[sync] 完成"
