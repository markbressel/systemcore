; SystemCore installer hooks (Tauri NSIS).

; RAM/motherboard RGB and the CPU temperature need PawnIO, a signed hardware-access driver (https://pawnio.eu).
; Its official installer ships with SystemCore (redistribution is allowed) and runs silently once; it asks
; for administrator rights itself. Skipped when PawnIO is already installed. Declining it only disables
; those features. PawnIO stays installed on uninstall: other hardware tools may use it too.
!macro NSIS_HOOK_POSTINSTALL
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO" "DisplayVersion"
  SetRegView lastused
  ${If} $0 == ""
    DetailPrint "Installing the PawnIO hardware driver..."
    ExecWait '"$INSTDIR\pawnio\PawnIO_setup.exe" -install -silent' $1
    DetailPrint "PawnIO setup finished ($1)"
  ${EndIf}
!macroend
