@echo off
rem Get the full path of the dropped file (%1)
set "sourceFile=%1"

rem Extract just the filename (without extension)
for %%F in ("%sourceFile%") do set "filename=%%~nF"

rem Set the new filename and file type
set "newFilename=new_filename"
set "fileType=.bat"  rem Change the file type as needed

rem Copy the file and rename it
copy "%sourceFile%" "%filename%%fileType%"