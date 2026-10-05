#!/usr/bin/env bash
# Installs the debug build on the emulator, opens it and records what the screen shows.
set -x
mkdir -p shots
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -W -n com.orascom.hseaudit/.MainActivity
sleep 40
adb exec-out screencap -p > shots/01_open.png
adb shell input keyevent KEYCODE_BACK
sleep 3
adb exec-out screencap -p > shots/02_after_back.png
adb shell am force-stop com.orascom.hseaudit
adb shell am start -W -n com.orascom.hseaudit/.MainActivity --ez selftest true
sleep 25
adb exec-out screencap -p > shots/03_selftest.png
adb shell ls -la "/sdcard/Download/HSE Audit/" > shots/downloads.txt 2>&1
adb shell dumpsys package com.orascom.hseaudit | grep -E "versionName|targetSdk|minSdk" > shots/package.txt
adb logcat -d -v brief HSEAudit:V chromium:W AndroidRuntime:E "*:S" > shots/logcat.txt
true
