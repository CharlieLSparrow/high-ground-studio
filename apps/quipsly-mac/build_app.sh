#!/bin/bash
set -e

# Build the project
swift build -c debug

APP_NAME="Quipsly"
APP_DIR="$APP_NAME.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"
RES_DIR="$APP_DIR/Contents/Resources"

echo "Creating app bundle structure..."
mkdir -p "$MACOS_DIR"
mkdir -p "$RES_DIR"

echo "Copying binary..."
cp .build/debug/QuipslyMac "$MACOS_DIR/$APP_NAME"

echo "Copying resources..."
cp -R .build/debug/QuipslyMac_QuipslyMac.bundle "$RES_DIR/" || true

echo "Generating AppIcon.icns..."
ICON_PNG="/Users/wall-e/.gemini/antigravity/brain/a8bdf378-b485-4b0f-bf20-823ae909e011/artifacts/quipsly_app_icon_1781205174769.png"
ICONSET_DIR="AppIcon.iconset"
mkdir -p "$ICONSET_DIR"
sips -s format png -z 16 16     "$ICON_PNG" --out "$ICONSET_DIR/icon_16x16.png" > /dev/null
sips -s format png -z 32 32     "$ICON_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" > /dev/null
sips -s format png -z 32 32     "$ICON_PNG" --out "$ICONSET_DIR/icon_32x32.png" > /dev/null
sips -s format png -z 64 64     "$ICON_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" > /dev/null
sips -s format png -z 128 128   "$ICON_PNG" --out "$ICONSET_DIR/icon_128x128.png" > /dev/null
sips -s format png -z 256 256   "$ICON_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" > /dev/null
sips -s format png -z 256 256   "$ICON_PNG" --out "$ICONSET_DIR/icon_256x256.png" > /dev/null
sips -s format png -z 512 512   "$ICON_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" > /dev/null
sips -s format png -z 512 512   "$ICON_PNG" --out "$ICONSET_DIR/icon_512x512.png" > /dev/null
sips -s format png -z 1024 1024 "$ICON_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" > /dev/null
iconutil -c icns "$ICONSET_DIR" -o "$RES_DIR/AppIcon.icns"
rm -rf "$ICONSET_DIR"

# Force macOS Finder to refresh the icon cache for the bundle
touch "$APP_DIR/Contents/Info.plist" 2>/dev/null || true
touch "$APP_DIR"

echo "App bundle created at $APP_DIR"
open "$APP_DIR"
