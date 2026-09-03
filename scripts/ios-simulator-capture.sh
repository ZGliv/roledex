#!/bin/zsh

set -euo pipefail

PROJECT_ROOT="${0:A:h:h}"
SIMULATOR_ID="${1:-booted}"
DERIVED_DATA="${JOBSWIPE_IOS_DERIVED_DATA:-/tmp/jobswipe-simulator-derived}"
OUTPUT_DIR="${JOBSWIPE_IOS_CAPTURE_DIR:-${PROJECT_ROOT}/docs/app-store/screenshots/runtime}"
APP_PATH="${DERIVED_DATA}/Build/Products/Debug-iphonesimulator/JobSwipe.app"
BUNDLE_ID="com.example.jobswipe"

mkdir -p "${OUTPUT_DIR}"

xcodebuild \
  -project "${PROJECT_ROOT}/ios/JobSwipe/JobSwipe.xcodeproj" \
  -scheme JobSwipe \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "id=${SIMULATOR_ID}" \
  -derivedDataPath "${DERIVED_DATA}" \
  build

xcrun simctl install "${SIMULATOR_ID}" "${APP_PATH}"

for tab in discover saved profile; do
  xcrun simctl terminate "${SIMULATOR_ID}" "${BUNDLE_ID}" 2>/dev/null || true
  xcrun simctl launch "${SIMULATOR_ID}" "${BUNDLE_ID}" --jobswipe-tab "${tab}"
  sleep 2
  xcrun simctl io "${SIMULATOR_ID}" screenshot "${OUTPUT_DIR}/${tab}.png"
done

echo "Captured Discover, Saved, and Profile in ${OUTPUT_DIR}"
