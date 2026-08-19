; Custom NSIS installer script for TCE — CG-0MSQ5CILR0007YS3
;
; Problem: The standard electron-builder NSIS installer (assisted mode,
; oneClick: false) checks for a running instance of "Tableau Card Engine.exe"
; before installing. When the user has NOT manually opened the app, a zombie
; Electron process from a previous session (crashed renderer / GPU child,
; which shares the main exe image name) can linger. With the old per-user
; config (perMachine: false), the installer runs non-elevated and its
; taskkill is username-filtered, so it cannot terminate an orphaned or
; elevated process — the user then sees:
;
;   "Tableau Card Engine cannot be closed. Please close it manually and
;    click Retry to continue."
;
; Fix (two parts):
;   1. electron-builder.yml: perMachine: true → the installer runs with
;      RequestExecutionLevel admin, so it can kill any user-level process.
;   2. This file: !macro customInit force-kills every "Tableau Card Engine"
;      process tree in .onInit (before the install section). Electron child
;      processes (renderer, GPU, utility) all share the main exe image name
;      on Windows, so a single taskkill /IM with /T covers the whole tree.
;
; The default CHECK_APP_RUNNING flow (allowOnlyOneInstallerInstance.nsh) is
; intentionally LEFT in place as a safety net: after customInit's kill, it
; finds no running process and proceeds silently. If a process somehow
; survives (e.g. protected system process), the standard confirmation /
; retry dialogs still give the user actionable feedback instead of a silent
; failure.

!macro customInit
  ; Force-kill all TCE processes. No username filter (covers other users),
  ; /T terminates the whole process tree (covers orphaned children whose
  ; parent already exited). Exit code is ignored — not finding a process is
  ; fine (fresh install).
  nsExec::ExecToLog 'taskkill /F /IM "Tableau Card Engine.exe" /T'
  ; Give the OS a moment to release file handles before the install section.
  Sleep 500
!macroend
