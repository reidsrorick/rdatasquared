@echo off
title Network Connectivity Checking - %date%
echo %date%

set day=%date:~7,2%
set month=%date:~4,2%
set year=%date:~10,4%

call "C:\Users\%username%\Desktop\Network Logs\Create Network Log Folders.bat"
echo.
echo Network checks will begin in 10 seconds.
timeout /t 10

cls
echo %date%
:CHECK_CONNECTIVITY
ping -n 1 www.google.com >nul

if %errorlevel% neq 0 (
color 4
echo ***********Internet connection lost! %time%***********
echo ***********Internet connection lost! %time%*********** >> "C:\Users\%username%\Desktop\Network Logs\%year%\%month%\%day%\connectivity_log_%month%-%day%-%year%.txt"

rem Add actions to be taken when the connection is lost. 
) else (
color 2
echo Internet connection is active. %time%
echo Internet connection is active. %time% >> "C:\Users\%username%\Desktop\Network Logs\%year%\%month%\%day%\connectivity_log_%month%-%day%-%year%.txt"
)

timeout /t 5 >nul
goto CHECK_CONNECTIVITY