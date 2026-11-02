; LAST SIGNALS · Windows-Installer (NSIS 3, auf dem Mac mit makensis gebaut, unsigniert)
; Aufruf über desktop/packen-windows.mjs, das SRC, OUTFILE, ICON, VERSION, VERSION4 und SIZE_KB setzt.
; Installiert für den aktuellen Benutzer nach %LOCALAPPDATA%\Programs\LAST SIGNALS (keine Admin-Rechte nötig),
; legt Startmenü- und Desktop-Verknüpfung an und trägt sich unter „Apps & Features“ zum Deinstallieren ein.
; Spielstände liegen getrennt in %APPDATA%\LAST SIGNALS und bleiben beim Deinstallieren erhalten.

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!include "MUI2.nsh"

!define APPNAME "LAST SIGNALS"
!define EXE "LAST SIGNALS.exe"
!define UNINST "Deinstallieren.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\de.lastsignals.spiel"

Name "${APPNAME}"
OutFile "${OUTFILE}"
; fester Ordner (keine Ordnerwahl): so löscht das Deinstallieren nie etwas außerhalb des Spielordners
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
BrandingText "${APPNAME} · Testversion ${VERSION}"
ShowInstDetails nevershow
ShowUninstDetails nevershow

VIProductVersion "${VERSION4}"
VIFileVersion "${VERSION4}"
VIAddVersionKey /LANG=0 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=0 "FileDescription" "${APPNAME} Installer (Testversion)"
VIAddVersionKey /LANG=0 "CompanyName" "077 GAMING"
VIAddVersionKey /LANG=0 "LegalCopyright" "LAST SIGNALS – Testversion"
VIAddVersionKey /LANG=0 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "German"
!insertmacro MUI_LANGUAGE "English"

Section "LAST SIGNALS" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  ; alte Programmdateien einer früheren Version entfernen (Spielstände liegen nicht hier)
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\${UNINST}"

  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0

  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "077 GAMING"
  WriteRegStr HKCU "${UNINSTKEY}" "URLInfoAbout" "https://lastsignals.de"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXE},0"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\${UNINST}"'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\${UNINST}" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" ${SIZE_KB}
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
SectionEnd
