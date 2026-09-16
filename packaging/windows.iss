#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef PackageDir
  #define PackageDir "..\release\package"
#endif
[Setup]
AppId={{22F5D107-C0A3-47A2-A892-965450807C91}
AppName=D2R Server
AppVersion={#AppVersion}
DefaultDirName={autopf}\D2R Server
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
OutputDir=..\release\assets
OutputBaseFilename=D2R-Server-{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
UninstallDisplayName=D2R Server
[Files]
Source: "{#PackageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Code]
function RunServiceAction(Action: String): Boolean;
var ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\setup-service.ps1') + '" -Action ' + Action,
    ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if FileExists(ExpandConstant('{app}\setup-service.ps1')) then
    if not RunServiceAction('Stop') then Result := 'Could not stop D2R Server. Close the service before upgrading.';
end;
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    if not RunServiceAction('Install') then RaiseException('Service installation failed. Check C:\ProgramData\D2RServer\logs.');
end;
function InitializeUninstall(): Boolean;
begin
  Result := RunServiceAction('Uninstall');
  if not Result then MsgBox('Could not remove D2R Server service.', mbError, MB_OK);
end;
