@echo off

set day=%date:~7,2%
set month=%date:~4,2%
set year=%date:~10,4%

if exist "C:\Users\reids\Desktop\Network Logs\%year%" (
    echo Folder Found
) else (
    echo Creating Folder
    mkdir "C:\Users\reids\Desktop\Network Logs\%year%"
)

if exist "C:\Users\reids\Desktop\Network Logs\%year%\%month%" (
    echo Folder Found
) else (
    echo Creating Folder
    mkdir "C:\Users\reids\Desktop\Network Logs\%year%\%month%"
)

if exist "C:\Users\reids\Desktop\Network Logs\%year%\%month%\%day%" (
    echo Folder Found
) else (
    echo Creating Folder
    mkdir "C:\Users\reids\Desktop\Network Logs\%year%\%month%\%day%"
)
