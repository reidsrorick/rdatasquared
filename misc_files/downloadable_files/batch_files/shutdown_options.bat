@echo off
:start
cls
echo --shutdown
echo --lock
echo --restart
echo --logoff
set /p USER_INPUT=What would you like to do?: 

if %USER_INPUT%==shutdown goto ask_for_time
if %USER_INPUT%==lock goto ask_for_time
if %USER_INPUT%==restart goto ask_for_time
if %USER_INPUT%==logoff goto log_off
goto error

:ask_for_time
set /p USER_TIME_INPUT=How long until you want this to run?(min): 
set /a total_secs=60*%USER_TIME_INPUT%

if %USER_INPUT%==shutdown goto shutdown
if %USER_INPUT%==lock goto lock
if %USER_INPUT%==restart goto restart


:shutdown
echo You chose shutdown
shutdown /s /t %total_secs%
goto cancel_shutdown

:lock
echo You chose lock
pause>nul
goto end

:restart
echo You chose restart
shutdown /r /t %total_secs%
goto cancel_shutdown

:log_off
echo You chose %USER_INPUT%
set /p confirm=Are you sure you would like to log out?(y/n): 
if %confirm%==y (shutdown /l)
if %confirm%==n goto end

goto cancel_shutdown

:error
cls
echo Please enter a valid process:
pause
goto start

:cancel_shutdown
set /p cancel_q=Would you like to cancel the %USER_INPUT%?(y/n): 
if %cancel_q%==y (shutdown /a) else goto cancel_shutdown
goto end

:end
echo end
pause