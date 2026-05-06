SHELL := /bin/bash

CONFIG ?= ./config.yaml

.PHONY: help deps api web dev build package windows all test clean docker-build docker-up docker-down

help:
	@echo "Common targets:"
	@echo "  make api          Run Go backend only with config.yaml"
	@echo "  make web          Run Vue frontend dev server"
	@echo "  make dev          Build embedded frontend and run local binary"
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

dev:
	./build.sh
	./bin/go-web --config ./bin/config.yaml

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