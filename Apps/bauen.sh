#!/usr/bin/env bash
# LAST SIGNALS: alle Test-Apps aus dem aktuellen Spielstand neu bauen (nichts wird veröffentlicht).
#
#   bash Apps/bauen.sh                 → Mac, iPhone/iPad und Android
#   bash Apps/bauen.sh mac android     → nur die genannten (mac | ios | android)
#   TEST=1 bash Apps/bauen.sh mac      → danach die Mac-App automatisch prüfen (tests/mac.mjs)
#   MAC_ARCH=arm64 bash Apps/bauen.sh  → nur Apple Silicon (Standard: arm64 und universal)
#   ZIEL=/pfad bash Apps/bauen.sh      → Ausgabeordner (Standard: ~/LAST-SIGNALS-Uebergabe/downloads)
#
# Voraussetzungen: Node 20+, Xcode (iOS), JDK 21 und Android-SDK (Android, siehe ANLEITUNG.md).
set -euo pipefail

APPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$APPS/.." && pwd)"
ZIEL="${ZIEL:-$HOME/LAST-SIGNALS-Uebergabe/downloads}"
MAC_ARCH="${MAC_ARCH:-alle}"
WAS=("$@"); [ ${#WAS[@]} -eq 0 ] && WAS=(mac ios android)
will() { local x; for x in "${WAS[@]}"; do [ "$x" = "$1" ] && return 0; done; return 1; }
schritt() { printf '\n==== %s\n' "$*"; }
mkdir -p "$ZIEL"

schritt "Abhängigkeiten"
[ -d "$ROOT/Code/node_modules" ] || (cd "$ROOT/Code" && npm ci)
[ -d "$APPS/node_modules" ] || (cd "$APPS" && npm ci)

schritt "Selbsttest des Spiels"
(cd "$ROOT/Code" && node src/sim/selftest.mjs | tail -1)

schritt "Web-Build (relative Basis, App-Kennung) → Apps/www"
(cd "$APPS" && node web.mjs)

if will mac; then
  schritt "Mac-App (Electron) → .zip und .dmg"
  (cd "$APPS" && node desktop/packen.mjs --arch "$MAC_ARCH" --ziel "$ZIEL")
  if [ "${TEST:-0}" = "1" ]; then (cd "$APPS" && node tests/mac.mjs); fi
fi

if will ios || will android; then
  schritt "Capacitor: Web-Build in die nativen Projekte kopieren"
  (cd "$APPS" && npx --no-install cap sync)
fi

if will ios; then
  schritt "iPhone/iPad: Simulator-Build"
  DD="$APPS/ios/DerivedData"
  xcodebuild -project "$APPS/ios/App/App.xcodeproj" -scheme App -configuration Debug \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DD" -packageAuthorizationProvider netrc \
    CODE_SIGNING_ALLOWED=NO build -quiet
  SIMAPP="$DD/Build/Products/Debug-iphonesimulator/App.app"
  rm -f "$ZIEL/LAST-SIGNALS-ios-simulator.zip"
  (cd "$(dirname "$SIMAPP")" && ditto -c -k --keepParent App.app "$ZIEL/LAST-SIGNALS-ios-simulator.zip")

  schritt "iPhone/iPad: unsignierte .ipa (für Sideloadly/AltStore)"
  xcodebuild -project "$APPS/ios/App/App.xcodeproj" -scheme App -configuration Release \
    -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath "$DD" -packageAuthorizationProvider netrc \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build -quiet
  DEVAPP="$DD/Build/Products/Release-iphoneos/App.app"
  PAY="$APPS/out/ipa"
  rm -rf "$PAY" && mkdir -p "$PAY/Payload"
  ditto "$DEVAPP" "$PAY/Payload/App.app"
  rm -f "$ZIEL/LAST-SIGNALS-ios-unsigniert.ipa"
  (cd "$PAY" && zip -qry "$ZIEL/LAST-SIGNALS-ios-unsigniert.ipa" Payload)
fi

if will android; then
  schritt "Android: Debug-APK"
  if [ -z "${JAVA_HOME:-}" ] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -qE 'version "(2[1-9]|[3-9][0-9])'; then
    for j in /opt/homebrew/opt/openjdk@21 /opt/homebrew/opt/openjdk "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
      if [ -x "$j/bin/java" ] && "$j/bin/java" -version 2>&1 | grep -qE 'version "(2[1-9]|[3-9][0-9])'; then export JAVA_HOME="$j"; break; fi
    done
  fi
  export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [ -z "$ANDROID_HOME" ]; then
    for s in /opt/homebrew/share/android-commandlinetools "$HOME/Library/Android/sdk"; do [ -d "$s/platforms" ] && { export ANDROID_HOME="$s"; break; }; done
  fi
  echo "JAVA_HOME=${JAVA_HOME:-?}  ANDROID_HOME=${ANDROID_HOME:-?}"
  [ -f "$APPS/android/local.properties" ] || echo "sdk.dir=$ANDROID_HOME" > "$APPS/android/local.properties"
  (cd "$APPS/android" && ./gradlew --no-daemon -q assembleDebug)
  APK="$APPS/android/app/build/outputs/apk/debug/app-debug.apk"
  cp "$APK" "$ZIEL/LAST-SIGNALS-android-debug.apk"
  BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
  "$BT/apksigner" verify --print-certs "$ZIEL/LAST-SIGNALS-android-debug.apk" | head -3
  "$BT/aapt" dump badging "$ZIEL/LAST-SIGNALS-android-debug.apk" | grep -E "^package|^sdkVersion|^targetSdkVersion|^application-label:|launchable-activity" || true
fi

schritt "Fertig"
ls -lh "$ZIEL" | grep -E 'LAST-SIGNALS' || true
