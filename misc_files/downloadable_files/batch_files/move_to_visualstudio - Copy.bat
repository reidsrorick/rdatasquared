@echo off
set "sourceFile=%~1"

:start_prog
echo [1] Batch Files
echo [2] Text Files
echo [3] Misc
set /p which_folder=Which folder would you like to move this to?: 

if %which_folder%==1 (goto batch_files)
if %which_folder%==2 (goto text_files)
if %which_folder%==3 (goto misc)

:error
echo An error occurred. Please try again.
pause
cls
goto start_prog

:batch_files
echo You Chose Batch Files
pause
move %sourceFile% "C:\Users\reids\source\repos\reidsrorick\hub\misc_files\downloadable_files\batch_files"
start "" C:\Users\reids\source\repos\reidsrorick\hub\misc_files\downloadable_files\batch_files"
goto end

:text_files
echo You Chose Text Files
move %sourceFile% "C:\Users\reids\source\repos\reidsrorick\hub\misc_files\downloadable_files\text_files"

:misc
echo You Chose Misc Files


:end
echo ending program now...
goto start_prog
pause



pause