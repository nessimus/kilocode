#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/.standalone"
CODE_OSS_DIR="$BUILD_DIR/vscode"
OUT_DIR="$BUILD_DIR/out"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' was not found" >&2
    exit 1
  fi
}

require_command git
require_command pnpm
require_command npm
require_command unzip

mkdir -p "$BUILD_DIR"

if [ ! -d "$CODE_OSS_DIR/.git" ]; then
  git clone --depth 1 https://github.com/microsoft/vscode.git "$CODE_OSS_DIR"
else
  git -C "$CODE_OSS_DIR" pull --ff-only
fi

pnpm install --frozen-lockfile
pnpm --filter kilo-code bundle
pnpm --filter kilo-code vsix
pnpm --filter kilo-code vsix:unpacked

pushd "$CODE_OSS_DIR" >/dev/null

npm ci

if [ -z "${TARGET_PLATFORM:-}" ]; then
  OS_NAME="$(uname -s)"
  ARCH_NAME="$(uname -m)"
  case "$OS_NAME" in
    Darwin)
      if [ "$ARCH_NAME" = "arm64" ]; then
        TARGET_PLATFORM="darwin-arm64"
      else
        TARGET_PLATFORM="darwin-x64"
      fi
      ;;
    Linux)
      if [ "$ARCH_NAME" = "aarch64" ] || [ "$ARCH_NAME" = "arm64" ]; then
        TARGET_PLATFORM="linux-arm64"
      else
        TARGET_PLATFORM="linux-x64"
      fi
      ;;
    *)
      echo "Unsupported platform: $OS_NAME" >&2
      exit 1
      ;;
  esac
fi

npm run gulp -- "vscode-${TARGET_PLATFORM}-min"

BUILD_ROOT="$CODE_OSS_DIR/.build/electron"
APP_SOURCE="$(ls -1dt "$BUILD_ROOT"/VSCode-* 2>/dev/null | head -n 1)"
if [ -z "$APP_SOURCE" ]; then
  echo "Could not locate built VS Code artifacts" >&2
  exit 1
fi

popd >/dev/null

DEST_DIR="$OUT_DIR/GoldenWorkspace-${TARGET_PLATFORM}"
rm -rf "$DEST_DIR"
mkdir -p "$OUT_DIR"
cp -R "$APP_SOURCE" "$DEST_DIR"

if [[ "$TARGET_PLATFORM" == darwin-* ]]; then
  APP_BUNDLE="$DEST_DIR/Visual Studio Code.app"
  if [ ! -d "$APP_BUNDLE" ]; then
    echo "Expected app bundle not found at $APP_BUNDLE" >&2
    exit 1
  fi
  mv "$APP_BUNDLE" "$DEST_DIR/Golden Workspace.app"
  RESOURCE_ROOT="$DEST_DIR/Golden Workspace.app/Contents/Resources/app"
else
  RESOURCE_ROOT="$DEST_DIR/resources/app"
fi

if [ ! -d "$RESOURCE_ROOT" ]; then
  echo "Missing resources directory at $RESOURCE_ROOT" >&2
  exit 1
fi

EXT_SOURCE="$ROOT_DIR/bin-unpacked/extension"
if [ ! -d "$EXT_SOURCE" ]; then
  echo "Expected unpacked extension at $EXT_SOURCE" >&2
  exit 1
fi

EXT_DEST="$RESOURCE_ROOT/extensions/kilo-code"
rm -rf "$EXT_DEST"
mkdir -p "$(dirname "$EXT_DEST")"
cp -R "$EXT_SOURCE" "$EXT_DEST"

node "$ROOT_DIR/scripts/merge-json.mjs" "$RESOURCE_ROOT/product.json" "$ROOT_DIR/standalone/product.overrides.json"

DEFAULT_USER_DIR="$RESOURCE_ROOT/defaultUserData/User"
mkdir -p "$DEFAULT_USER_DIR"
cp "$ROOT_DIR/standalone/default-settings.json" "$DEFAULT_USER_DIR/settings.json"

echo "\nStandalone build complete: $DEST_DIR"
if [[ "$TARGET_PLATFORM" == darwin-* ]]; then
  echo "Launch with: open '$DEST_DIR/Golden Workspace.app'"
else
  echo "Launch the executable inside $DEST_DIR"
fi
