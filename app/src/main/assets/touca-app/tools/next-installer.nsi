Unicode true
!include "MUI2.nsh"
Name "Touca Editor Next"
!ifndef OUTPUT
!define OUTPUT "${__FILEDIR__}/ToucaEditor-Next-Setup.exe"
!endif
!ifndef APP_ROOT
!define APP_ROOT "${__FILEDIR__}/../../.."
!endif
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Touca Editor Next"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "31.6.0.0"
VIAddVersionKey "ProductName" "Touca Editor Next"
VIAddVersionKey "FileDescription" "Instalador completo do Touca Editor Next"
VIAddVersionKey "FileVersion" "31.6.0"
VIAddVersionKey "LegalCopyright" "ToucaBR"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"
Section "Editor completo"
SetOutPath "$INSTDIR"
File /r "${APP_ROOT}/*"
CreateDirectory "$SMPROGRAMS\Touca Editor Next"
CreateShortcut "$SMPROGRAMS\Touca Editor Next\Touca Editor Next.lnk" "$INSTDIR\Touca Editor.exe"
CreateShortcut "$DESKTOP\Touca Editor Next.lnk" "$INSTDIR\Touca Editor.exe"
WriteUninstaller "$INSTDIR\Desinstalar.exe"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ToucaEditorNext" "DisplayName" "Touca Editor Next"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ToucaEditorNext" "DisplayVersion" "31.6.0"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ToucaEditorNext" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
SectionEnd
Section "Uninstall"
Delete "$DESKTOP\Touca Editor Next.lnk"
RMDir /r "$SMPROGRAMS\Touca Editor Next"
DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ToucaEditorNext"
RMDir /r "$INSTDIR"
SectionEnd
