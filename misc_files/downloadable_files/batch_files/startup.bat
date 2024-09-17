@echo off
set "sourceFile=%~1"
XCOPY "%sourceFile%" "C:\Users\reids\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
TIMEOUT /T 1
start "" "C:\Users\reids\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
