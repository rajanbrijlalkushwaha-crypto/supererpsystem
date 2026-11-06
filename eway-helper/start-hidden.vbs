' Starts the E-Way Helper in the background (no console window). Copied to the Startup folder by setup.bat.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = "C:\EpsilonEwayHelper"
If WScript.ScriptFullName <> "" Then
  here = fso.GetParentFolderName(WScript.ScriptFullName)
  If fso.FileExists(here & "\index.js") Then dir = here
End If
If Not fso.FileExists(dir & "\index.js") Then
  cfg = sh.ExpandEnvironmentStrings("%APPDATA%") & "\EpsilonEwayHelper\install-dir.txt"
  If fso.FileExists(cfg) Then dir = Trim(fso.OpenTextFile(cfg).ReadAll())
End If
sh.CurrentDirectory = dir
sh.Run "node index.js", 0, False
