; KIO SBS POS - Instalador Windows (Inno Setup 6)
; Generado por build_windows.ps1
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\flutter\build\windows\x64\runner\Release"
#endif
#ifndef OutputDir
  #define OutputDir ".\dist"
#endif

[Setup]
AppId={{A7C4D8E1-7F2A-4B5C-9D3E-KIOSBSPOS001}}
AppName=KIO SBS POS
AppVersion={#AppVersion}
AppPublisher=Artix
AppPublisherURL=https://artix.co
DefaultDirName={autopf}\KIO SBS POS
DefaultGroupName=KIO SBS
OutputDir={#OutputDir}
OutputBaseFilename=KIO-SBS-POS-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
PrivilegesRequired=lowest

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\KIO SBS POS"; Filename: "{app}\kio_sbs.exe"
Name: "{group}\{cm:UninstallProgram,KIO SBS POS}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\KIO SBS POS"; Filename: "{app}\kio_sbs.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\kio_sbs.exe"; Description: "{cm:LaunchProgram,KIO SBS POS}"; Flags: nowait postinstall skipifsilent
