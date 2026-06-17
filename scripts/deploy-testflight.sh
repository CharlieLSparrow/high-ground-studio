#!/usr/bin/env bash
set -e

echo "Deploying HighGroundCapture to TestFlight..."
cd apps/mobile-capture/HighGroundCapture

if ! command -v bundle &> /dev/null; then
  echo "Error: Ruby bundler is not installed. Please install it with 'gem install bundler'."
  exit 1
fi

echo "Installing Fastlane..."
bundle install

echo "Building and Uploading to TestFlight..."
bundle exec fastlane beta
