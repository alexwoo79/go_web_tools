#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/vue-form"
EMBED_DIR="$ROOT_DIR/ui/frontend"
TARGET="${1:-native}"

usage() {
	cat <<'EOF'
Usage: ./build.sh [native|windows|all]

	native   Build current platform binary (default)
	windows  Build Windows amd64 binary
	all      Build both native and Windows binaries
EOF
}

build_native() {
	echo "[3/3] Building Go native binary..."
	cd "$ROOT_DIR"
	mkdir -p bin
	CGO_ENABLED=0 go build -o bin/go-web ./cmd/server
	echo "Build complete: $ROOT_DIR/bin/go-web"
}

build_windows() {
	echo "[3/3] Building Go Windows binary..."
	cd "$ROOT_DIR"
	mkdir -p bin
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o bin/go-web.exe ./cmd/server
	echo "Build complete: $ROOT_DIR/bin/go-web.exe"
}

build_multi() {
	echo "[3/3] Building cross-platform binaries (amd64/arm64)..."
	cd "$ROOT_DIR"
	mkdir -p bin

	targets=(
		"linux amd64"
		"linux arm64"
		"darwin amd64"
		"darwin arm64"
		"windows amd64"
	)

	for t in "${targets[@]}"; do
		read -r os arch <<<"$t"
		outfile="bin/go-web-${os}-${arch}"
		ext=""
		if [ "$os" = "windows" ]; then
			ext=".exe"
		fi
		echo "Building $os/$arch -> ${outfile}${ext}"
		CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -o "${outfile}${ext}" ./cmd/server
	done

	echo "Cross build complete: $ROOT_DIR/bin/"
}

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
	echo "[1/3] Installing Vue frontend dependencies..."
	cd "$FRONTEND_DIR"
	npm ci
fi

echo "[1/3] Building Vue frontend..."
cd "$FRONTEND_DIR"
npm run build

echo "[2/3] Syncing dist to embed directory..."
rm -rf "$EMBED_DIR"/*
cp -R "$FRONTEND_DIR"/dist/* "$EMBED_DIR"/

case "$TARGET" in
	native)
		build_native
		;;
	windows)
		build_windows
		;;
	all)
		build_multi
		;;
	-h|--help|help)
		usage
		;;
	*)
		echo "Unknown target: $TARGET"
		usage
		exit 1
		;;
esac
