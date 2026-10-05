#!/usr/bin/env bash
# Installs the signed release app the way a phone would and opens it.
set -x
mkdir -p shots
adb install downloads/HSE-Audit.apk > shots/install.txt 2>&1
cat shots/install.txt
adb logcat -c
adb shell am start -W -n com.orascom.hseaudit/.MainActivity
sleep 40
adb exec-out screencap -p > shots/signed_open.png
adb shell dumpsys package com.orascom.hseaudit | grep -E "versionName|targetSdk|signatures|pkgFlags" > shots/package.txt
adb logcat -d -v brief HSEAudit:V chromium:W AndroidRuntime:E "*:S" > shots/logcat.txt
true
