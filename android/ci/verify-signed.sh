#!/usr/bin/env bash
# Installs the signed release app the way a phone would and opens it.
set -x
mkdir -p shots
# Wait until the emulator can reach the site (DNS is slow right after boot).
for i in $(seq 1 30); do adb shell ping -c 1 -W 3 hsescct-sudo.github.io >/dev/null 2>&1 && break; sleep 4; done
adb shell ping -c 1 -W 3 hsescct-sudo.github.io > shots/network.txt 2>&1
adb install downloads/HSE-Audit.apk > shots/install.txt 2>&1
cat shots/install.txt
adb logcat -c
adb shell am start -W -n com.orascom.hseaudit/.MainActivity
for i in $(seq 1 30); do adb logcat -d -s HSEAudit:I | grep -q "page finished" && break; sleep 3; done
sleep 12
adb exec-out screencap -p > shots/signed_open.png
adb shell dumpsys package com.orascom.hseaudit | grep -E "versionName|targetSdk|signatures|pkgFlags" > shots/package.txt
adb logcat -d -v brief HSEAudit:V chromium:W AndroidRuntime:E "*:S" > shots/logcat.txt
true
