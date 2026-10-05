#!/usr/bin/env bash
# Installs the signed release app the way a phone would and opens it.
set -x
mkdir -p shots
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
sleep 25  # let the launcher and the network settle after boot
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb install downloads/HSE-Audit.apk > shots/install.txt 2>&1
cat shots/install.txt
adb logcat -c
on_top() { adb shell dumpsys activity activities | grep -E "topResumedActivity" | grep -q hseaudit; }
for i in 1 2 3; do
  adb shell am start -W -n com.orascom.hseaudit/.MainActivity
  sleep 5
  on_top && break
done
for i in $(seq 1 30); do adb logcat -d -s HSEAudit:I | grep -q "page finished" && break; sleep 3; done
# Take screenshots until the sign-in page has been painted (a blank screen compresses to a few KB).
for i in $(seq 1 24); do
  on_top || adb shell am start -n com.orascom.hseaudit/.MainActivity
  adb exec-out screencap -p > shots/signed_open.png
  on_top && [ "$(stat -c %s shots/signed_open.png)" -gt 60000 ] && break
  sleep 5
done
adb shell dumpsys activity activities | grep -E "topResumedActivity" > shots/top.txt
adb shell dumpsys package com.orascom.hseaudit | grep -E "versionName|targetSdk|signatures|pkgFlags" > shots/package.txt
adb logcat -d -v brief HSEAudit:V chromium:W AndroidRuntime:E ActivityTaskManager:I "*:S" > shots/logcat.txt
true
