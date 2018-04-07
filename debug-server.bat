@echo off
TITLE node.js Server prompt
start chrome --new-window "about:inspect"
@echo on
cmd /k node --inspect index.js
pause