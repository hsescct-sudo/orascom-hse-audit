#!/usr/bin/env bash
# Installs the signed release app the way a phone would and opens it.
set -x
mkdir -p shots
sleep 20  # let the emulator's network settle after boot
adb install downloads/HSE-Audit.apk > shots/install.txt 2>&1
cat shots/install.txt
adb logcat -c
adb shell am start -W -n com.orascom.hseaudit/.MainActivity
for i in $(seq 1 30); do adb logcat -d -s HSEAudit:I | grep -q "page finished" && break; sleep 3; done
# Take screenshots until the sign-in page has been painted (a blank screen compresses to a few KB).
for i in $(seq 1 20); do
  adb exec-out screencap -p > shots/signed_open.png
  [ "$(stat -c %s shots/signed_open.png)" -gt 60000 ] && break
  sleep 5
done
adb shell dumpsys package com.orascom.hseaudit | grep -E "versionName|targetSdk|signatures|pkgFlags" > shots/package.txt
adb logcat -d -v brief HSEAudit:V chromium:W AndroidRuntime:E "*:S" > shots/logcat.txt
true
