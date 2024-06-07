@echo off
set "sourceFile=%~1"
set newFileName=COPY_%~nx1%

echo Source File Set
echo Source: %sourceFile%
echo New File Name: %newFileName%
pause

copy "%sourceFile%" "C:\Users\%username%\desktop\%newFileName%"
echo copy done
pause