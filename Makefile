SHELL := /bin/bash

CONFIG ?= ./config.yaml
DEMO_PORT ?= 18099

.PHONY: help deps api web dev demo air build package windows all test clean docker-build docker-up docker-down \
	wails-dev wails-build wails-build-mac wails-package-win wails-install-tools

help:
	@echo "Common targets:"
	@echo "  make api          Run Go backend only with config.yaml"
	@echo "  make web          Run Vue frontend dev server"
	@echo "  make air          Run Go hot reload + Vue Vite dev server"
	@echo "  make dev          Build embedded frontend and run local binary"
	@echo "  make demo         Run embedded binary against .demo/config.yaml (独立演示库, port 18099)"
	@echo "  make build        Build local binary with embedded frontend"
	@echo "  make package      Same as make build"
	@echo "  make windows      Build Windows binary with embedded frontend"
	@echo "  make all          Build local and Windows binaries"
	@echo "  make test         Run Go tests"
	@echo "  make docker-build Build Docker image"
	@echo "  make docker-up    Start Docker service"
	@echo "  make docker-down  Stop Docker service"
	@echo "  make release       Create GitHub Release with build artifacts"
	@echo ""
	@echo "Wails 桌面端:"
	@echo "  make wails-dev          Wails 桌面端开发模式（Vite 热重载 + 后端 8080）"
	@echo "  make wails-build        构建当前平台桌面应用（build/bin/）"
	@echo "  make wails-build-mac    构建 macOS 通用 .app"
	@echo "  make wails-package-win  构建 Windows NSIS 安装包"
	@echo "  make wails-install-tools 安装 Wails CLI"

deps:
	cd ./vue-form && npm ci

api:
	go run ./cmd/server --config $(CONFIG)

web:
	cd ./vue-form && npm run dev

air:
	@trap 'kill 0' INT TERM EXIT; \
		(air -c .air.toml) & \
		(cd ./vue-form && npm run dev -- --host 127.0.0.1) & \
		wait

dev:
	./build.sh
	./bin/go-web --config ./bin/config.yaml

demo:
	@test -d .demo || (echo "演示目录 .demo 不存在，请先创建 .demo/config.yaml（数据库用临时路径，includes 指向演示表单，如 .demo/jixiao_2026q2_table.yaml）" && exit 1)
	@test -x ./bin/go-web || $(MAKE) build
	./bin/go-web --config .demo/config.yaml --port $(DEMO_PORT)

build:
	./build.sh

package: build

windows:
	./build.sh windows

all:
	./build.sh all

test:
	go test ./...

clean:
	rm -rf ./bin/go-web ./bin/go-web.exe ./vue-form/dist ./ui/frontend/*

docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

release:
	./release.sh

# ============================================================
# Wails 桌面端（将 Web 表单系统打包为桌面应用）
# ============================================================
wails-dev: ## Wails 桌面端开发（Vite 热重载 + 后端 127.0.0.1:8080）
	@echo "[wails] 启动 Wails 开发模式..."
	wails dev

wails-build: ## 构建当前平台桌面应用
	./scripts/sync_frontend.sh
	wails build

wails-build-mac: ## 构建 macOS 通用 .app
	./scripts/sync_frontend.sh
	wails build -platform darwin/universal

wails-package-win: ## 构建 Windows NSIS 安装包
	./scripts/sync_frontend.sh
	wails build -platform windows/amd64 -nsis

wails-install-tools: ## 安装 Wails CLI
	@command -v wails >/dev/null 2>&1 || go install github.com/wailsapp/wails/v2/cmd/wails@latest
	@wails version
