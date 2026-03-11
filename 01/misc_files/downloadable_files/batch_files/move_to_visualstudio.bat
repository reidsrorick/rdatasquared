@echo off
set "sourceFile=%~1"

:start_prog
cls
echo [1] Batch Files
echo [2] Text Files
echo [3] Misc
set /p which_folder=Which folder would you like to move this to?: 

if %which_folder%==1 (goto batch_files)
if %which_folder%==2 (goto text_files)
if %which_folder%==3 (goto misc)

rem -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

:error

echo An error occurred. Please try again.
pause
cls
goto start_prog

rem -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

:batch_files

echo You Chose Batch Files
pause
move "%sourceFile%" "C:\Users\reids\source\repos\reidsrorick\hub\misc_files\downloadable_files\batch_files"
start "" C:\Users\%username%\source\repos\reidsrorick\hub\misc_files\downloadable_files\batch_files"
goto end

rem -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

:text_files

echo You Chose Text Files
move "%sourceFile%" "C:\Users\reids\source\repos\reidsrorick\hub\misc_files\downloadable_files\text_files"
start "" C:\Users\%username%\source\repos\reidsrorick\hub\misc_files\downloadable_files\batch_files"
goto end

rem -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

:misc

echo You Chose Misc Files
echo We do not have any folder under "Misc", please try again.
timeout /t 10
goto start_prog

rem -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

:end
echo You have reached the end
set /p continue=Would you like to continue? (y/n): 
if %continue%==y goto start_prog
if %continue%==n echo ending program now...
timeout /t 10