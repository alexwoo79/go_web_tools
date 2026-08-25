SHELL := /bin/bash

CONFIG ?= ./config.yaml
DEMO_PORT ?= 18099

.PHONY: help deps api web dev demo air build package windows all test clean docker-build docker-up docker-down

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
