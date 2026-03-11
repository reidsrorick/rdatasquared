@echo off
title Network Connectivity Checking
:CHECK_CONNECTIVITY
ping -n 1 www.google.com >nul
if %errorlevel% neq 0 (
color 4
echo Internet connection lost! %date% - %time%
rem Add actions to be taken when the connection is lost. 
) else (
color 2
echo Internet connection is active. %date% - %time%
)
timeout /t 5 >nul
goto CHECK_CONNECTIVITY