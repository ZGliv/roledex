#!/bin/zsh
set -euo pipefail

repo_root="${0:A:h:h}"
cd "$repo_root"

required=(APPLE_TEAM_ID JOBSWIPE_BUNDLE_ID JOBSWIPE_DISPLAY_NAME JOBSWIPE_PUBLIC_URL)
for name in $required; do
  if [[ -z "${(P)name:-}" ]]; then
    print -u2 "Missing required environment value: $name"
    exit 2
  fi
done

if [[ ! "$APPLE_TEAM_ID" =~ '^[A-Z0-9]{10}$' ]]; then
  print -u2 "APPLE_TEAM_ID must be the 10-character Apple Developer Team ID."
  exit 2
fi
if [[ ! "$JOBSWIPE_BUNDLE_ID" =~ '^[A-Za-z0-9]+([.-][A-Za-z0-9]+)+$' ]]; then
  print -u2 "JOBSWIPE_BUNDLE_ID must be an owner-controlled reverse-DNS identifier."
  exit 2
fi
if [[ "$JOBSWIPE_PUBLIC_URL" != https://* ]]; then
  print -u2 "JOBSWIPE_PUBLIC_URL must be a permanent HTTPS origin."
  exit 2
fi

public_url="${JOBSWIPE_PUBLIC_URL%/}/"
associated_domain="${public_url#https://}"
associated_domain="${associated_domain%%/*}"
if [[ -z "$associated_domain" || "$associated_domain" == *:* ]]; then
  print -u2 "JOBSWIPE_PUBLIC_URL must use the default HTTPS port and include a valid host."
  exit 2
fi

version="${JOBSWIPE_VERSION:-1.0.0}"
build_number="${JOBSWIPE_BUILD_NUMBER:-1}"
output_root="${JOBSWIPE_ARCHIVE_OUTPUT_DIR:-$repo_root/build/app-store}"
archive_path="$output_root/JobSwipe-$version-$build_number.xcarchive"
export_path="$output_root/export-$version-$build_number"

if [[ -e "$archive_path" ]]; then
  print -u2 "Archive already exists: $archive_path"
  print -u2 "Choose a new JOBSWIPE_BUILD_NUMBER or move the existing archive."
  exit 2
fi

mkdir -p "$output_root"

print "Building the locally bundled Capacitor client"
VITE_JOBSWIPE_API_BASE_URL="$public_url" \
VITE_JOBSWIPE_APP_VERSION="$version" \
VITE_JOBSWIPE_BUILD_NUMBER="$build_number" \
npm run mobile:sync

print "Archiving $JOBSWIPE_DISPLAY_NAME $version ($build_number)"
print "Bundle: $JOBSWIPE_BUNDLE_ID"
print "API: $public_url"
print "Associated domain: $associated_domain"

xcodebuild \
  -project mobile/ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$archive_path" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$JOBSWIPE_BUNDLE_ID" \
  INFOPLIST_KEY_CFBundleDisplayName="$JOBSWIPE_DISPLAY_NAME" \
  MARKETING_VERSION="$version" \
  CURRENT_PROJECT_VERSION="$build_number" \
  JOBSWIPE_ASSOCIATED_DOMAIN="$associated_domain" \
  archive

print "Archive created: $archive_path"

if [[ "${JOBSWIPE_UPLOAD_TO_APP_STORE:-false}" != "true" ]]; then
  print "Upload not requested. Inspect the archive in Xcode Organizer, then rerun with JOBSWIPE_UPLOAD_TO_APP_STORE=true."
  exit 0
fi

export_options="$(mktemp /tmp/jobswipe-export-options.XXXXXX.plist)"
trap 'rm -f "$export_options"' EXIT
plutil -create xml1 "$export_options"
plutil -insert method -string app-store-connect "$export_options"
plutil -insert destination -string upload "$export_options"
plutil -insert signingStyle -string automatic "$export_options"
plutil -insert teamID -string "$APPLE_TEAM_ID" "$export_options"
plutil -insert manageAppVersionAndBuildNumber -bool false "$export_options"
plutil -insert uploadSymbols -bool true "$export_options"

mkdir -p "$export_path"
xcodebuild \
  -exportArchive \
  -archivePath "$archive_path" \
  -exportPath "$export_path" \
  -exportOptionsPlist "$export_options" \
  -allowProvisioningUpdates

print "Archive uploaded to App Store Connect."
