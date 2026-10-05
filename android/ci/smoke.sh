#!/usr/bin/env bash
# Installs the debug build on the emulator, opens it and records what the screen and the page show.
set -x
mkdir -p shots
pip install -q websocket-client || pip install -q --user websocket-client
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -W -n com.orascom.hseaudit/.MainActivity
sleep 45
adb exec-out screencap -p > shots/01_open.png
SOCK=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1)
adb forward tcp:9222 localabstract:$SOCK
python3 android/ci/cdp.py > shots/page_state.json
sleep 30
adb exec-out screencap -p > shots/02_open_75s.png
python3 android/ci/cdp.py > shots/page_state_75s.json
adb shell dumpsys activity activities | grep -E "ResumedActivity|topResumed" > shots/activity.txt
adb shell am force-stop com.orascom.hseaudit
adb shell am start -W -n com.orascom.hseaudit/.MainActivity --ez selftest true
sleep 40
adb exec-out screencap -p > shots/03_selftest.png
adb shell dumpsys activity activities | grep -E "ResumedActivity|topResumed" >> shots/activity.txt
adb shell 'ls -la "/sdcard/Download/HSE Audit/"' > shots/downloads.txt 2>&1
adb shell dumpsys package com.google.android.webview | grep versionName > shots/webview.txt
adb shell dumpsys package com.orascom.hseaudit | grep -E "versionName|targetSdk|minSdk" > shots/package.txt
adb logcat -d -v brief HSEAudit:V chromium:W AndroidRuntime:E ActivityTaskManager:I "*:S" > shots/logcat.txt
true
