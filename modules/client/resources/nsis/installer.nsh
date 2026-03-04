; ---------------------------------------------------------------------------
; Stellarity Client — NSIS Installer Include
;
; - Default install path: user-selectable (any drive/folder)
; - App data stored in: %LOCALAPPDATA%\Stellarity
; - Per-user install (no admin required unless user requests it)
; ---------------------------------------------------------------------------

!macro customInit
  ; Default to a sensible per-user location, but the directory chooser
  ; page (allowToChangeInstallationDirectory = true) lets the user pick
  ; any drive or folder they want.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Stellarity"
!macroend

!macro customInstall
  ; Ensure the app-data directory exists so the application can write
  ; config, cache, and logs from first launch.
  CreateDirectory "$LOCALAPPDATA\Stellarity"
  CreateDirectory "$LOCALAPPDATA\Stellarity\config"
  CreateDirectory "$LOCALAPPDATA\Stellarity\cache"
  CreateDirectory "$LOCALAPPDATA\Stellarity\logs"
!macroend

!macro customUnInstall
  ; Ask whether to remove user data on uninstall
  MessageBox MB_YESNO "Remove Stellarity application data from $LOCALAPPDATA\Stellarity?" /SD IDNO IDYES removeData IDNO skipRemove
  removeData:
    RMDir /r "$LOCALAPPDATA\Stellarity"
  skipRemove:
!macroend
