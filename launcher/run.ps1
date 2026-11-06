# Universal Core ERP Solution — launcher
# First run: asks for the server link (+ start-with-Windows, + language
# placeholder), saves it, then opens a chromeless Edge app window pointed
# at it (Firefox as a fallback if Edge isn't installed). Stays resident as
# a system tray icon afterwards so "Change Server Link" is always reachable
# — including while logged out — without re-running the exe from Desktop.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# Resolve the exe's own path/folder. $PSScriptRoot and
# [Reflection.Assembly]::GetExecutingAssembly().Location both come back
# EMPTY inside a ps2exe-compiled binary (ps2exe runs the script from an
# in-memory wrapper, not an actual file on disk) — the one path that
# reliably resolves to the real running .exe in that case is the current
# process's own main module path.
$exePath = $null
try { $exePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName } catch {}
if (-not $exePath) { $exePath = [System.Reflection.Assembly]::GetExecutingAssembly().Location }
$here = Split-Path -Parent $exePath

$appDataDir = Join-Path $env:LOCALAPPDATA "UniversalCoreERP"
if (-not (Test-Path $appDataDir)) { New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null }
$configFile = Join-Path $appDataDir "config.json"
$RUN_KEY = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RUN_NAME = "UniversalCoreERP"

function Load-Config {
  if (Test-Path $configFile) {
    try { return (Get-Content $configFile -Raw | ConvertFrom-Json) } catch {}
  }
  return $null
}

function Save-Config($cfg) {
  $cfg | ConvertTo-Json | Out-File -FilePath $configFile -Encoding utf8 -Force
}

function Set-StartWithWindows([bool]$enable) {
  if ($enable) {
    Set-ItemProperty -Path $RUN_KEY -Name $RUN_NAME -Value "`"$exePath`"" -Force
  } else {
    Remove-ItemProperty -Path $RUN_KEY -Name $RUN_NAME -ErrorAction SilentlyContinue
  }
}

# ── Settings dialog — shown on first run, and any time "Change Server
#    Link" is picked from the tray icon. Returns the saved config, or
#    $null if the user cancelled. ──
function Show-SettingsDialog($existing) {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = "Universal Core ERP Solution — Settings"
  $form.Size = New-Object System.Drawing.Size(460, 330)
  $form.StartPosition = "CenterScreen"
  $form.FormBorderStyle = "FixedDialog"
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $iconPath = Join-Path $here "app.ico"
  if (Test-Path $iconPath) { $form.Icon = New-Object System.Drawing.Icon($iconPath) }

  $lblHeader = New-Object System.Windows.Forms.Label
  $lblHeader.Text = "Universal Core ERP Solution"
  $lblHeader.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
  $lblHeader.Location = New-Object System.Drawing.Point(20, 15)
  $lblHeader.Size = New-Object System.Drawing.Size(420, 28)
  $form.Controls.Add($lblHeader)

  $lblUrl = New-Object System.Windows.Forms.Label
  $lblUrl.Text = "Server Link"
  $lblUrl.Location = New-Object System.Drawing.Point(20, 60)
  $lblUrl.Size = New-Object System.Drawing.Size(420, 18)
  $form.Controls.Add($lblUrl)

  $txtUrl = New-Object System.Windows.Forms.TextBox
  $txtUrl.Location = New-Object System.Drawing.Point(20, 80)
  $txtUrl.Size = New-Object System.Drawing.Size(410, 24)
  $txtUrl.Font = New-Object System.Drawing.Font("Segoe UI", 10)
  $txtUrl.Text = if ($existing -and $existing.ServerUrl) { $existing.ServerUrl } else { "http://192.168.1.3" }
  $form.Controls.Add($txtUrl)

  $lblLang = New-Object System.Windows.Forms.Label
  $lblLang.Text = "Language"
  $lblLang.Location = New-Object System.Drawing.Point(20, 120)
  $lblLang.Size = New-Object System.Drawing.Size(200, 18)
  $form.Controls.Add($lblLang)

  $cmbLang = New-Object System.Windows.Forms.ComboBox
  $cmbLang.Location = New-Object System.Drawing.Point(20, 140)
  $cmbLang.Size = New-Object System.Drawing.Size(200, 24)
  $cmbLang.DropDownStyle = "DropDownList"
  [void]$cmbLang.Items.Add("English")
  [void]$cmbLang.Items.Add("हिंदी (Hindi)")
  $cmbLang.SelectedIndex = if ($existing -and $existing.Language -eq "hi") { 1 } else { 0 }
  $form.Controls.Add($cmbLang)
  $lblLangNote = New-Object System.Windows.Forms.Label
  $lblLangNote.Text = "(saved for later — the app itself isn't translated yet)"
  $lblLangNote.ForeColor = [System.Drawing.Color]::Gray
  $lblLangNote.Font = New-Object System.Drawing.Font("Segoe UI", 8)
  $lblLangNote.Location = New-Object System.Drawing.Point(20, 166)
  $lblLangNote.Size = New-Object System.Drawing.Size(410, 16)
  $form.Controls.Add($lblLangNote)

  $chkStartup = New-Object System.Windows.Forms.CheckBox
  $chkStartup.Text = "Open automatically when Windows starts"
  $chkStartup.Location = New-Object System.Drawing.Point(20, 195)
  $chkStartup.Size = New-Object System.Drawing.Size(410, 24)
  $chkStartup.Checked = [bool]($existing -and $existing.StartWithWindows)
  $form.Controls.Add($chkStartup)

  $lblStatus = New-Object System.Windows.Forms.Label
  $lblStatus.Text = ""
  $lblStatus.Location = New-Object System.Drawing.Point(20, 228)
  $lblStatus.Size = New-Object System.Drawing.Size(410, 20)
  $lblStatus.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
  $form.Controls.Add($lblStatus)

  $btnConnect = New-Object System.Windows.Forms.Button
  $btnConnect.Text = "Connect"
  $btnConnect.Location = New-Object System.Drawing.Point(235, 255)
  $btnConnect.Size = New-Object System.Drawing.Size(195, 32)
  $btnConnect.BackColor = [System.Drawing.Color]::FromArgb(19, 61, 128)
  $btnConnect.ForeColor = [System.Drawing.Color]::White
  $btnConnect.FlatStyle = "Flat"
  $form.Controls.Add($btnConnect)
  $form.AcceptButton = $btnConnect

  $btnCancel = New-Object System.Windows.Forms.Button
  $btnCancel.Text = "Cancel"
  $btnCancel.Location = New-Object System.Drawing.Point(125, 255)
  $btnCancel.Size = New-Object System.Drawing.Size(100, 32)
  $form.Controls.Add($btnCancel)
  $form.CancelButton = $btnCancel

  $result = $null
  $btnConnect.Add_Click({
    $u = $txtUrl.Text.Trim()
    if ($u -notmatch '^https?://') {
      $lblStatus.ForeColor = [System.Drawing.Color]::Firebrick
      $lblStatus.Text = "Enter a valid link starting with http:// or https://"
      return
    }

    $btnConnect.Enabled = $false
    $btnCancel.Enabled = $false
    $lblStatus.ForeColor = [System.Drawing.Color]::DimGray
    $lblStatus.Text = "Connecting..."
    $lblStatus.Refresh()
    [System.Windows.Forms.Application]::DoEvents()

    $reachable = $false
    try {
      Invoke-WebRequest -Uri $u -Method Head -TimeoutSec 6 -UseBasicParsing -ErrorAction Stop | Out-Null
      $reachable = $true
    } catch [System.Net.WebException] {
      # A server that answered with an HTTP error status (404/403/500/...)
      # still proves the link itself is reachable — only a true network
      # failure (timeout, refused, DNS) means it isn't.
      if ($_.Exception.Response) { $reachable = $true }
    } catch {
      $reachable = $false
    }

    if (-not $reachable) {
      $btnConnect.Enabled = $true
      $btnCancel.Enabled = $true
      $lblStatus.ForeColor = [System.Drawing.Color]::Firebrick
      $lblStatus.Text = "Could not connect to this link. Check the address and try again."
      return
    }

    $script:result = [PSCustomObject]@{
      ServerUrl        = $u
      StartWithWindows = $chkStartup.Checked
      Language         = if ($cmbLang.SelectedIndex -eq 1) { "hi" } else { "en" }
    }
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
  })
  $btnCancel.Add_Click({ $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel; $form.Close() })

  $dr = $form.ShowDialog()
  $form.Dispose()
  if ($dr -eq [System.Windows.Forms.DialogResult]::OK) { return $script:result }
  return $null
}

function Open-ErpWindow($url) {
  $edgeCandidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  $edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $edge) {
    try {
      $edge = (Get-ItemProperty "HKLM:\SOFTWARE\Clients\StartMenuInternet\Microsoft Edge\shell\open\command" -ErrorAction Stop).'(default)' -replace '^"([^"]+)".*$', '$1'
    } catch { $edge = $null }
  }

  if ($edge -and (Test-Path $edge)) {
    # --app= gives a window with no address bar, tabs, or navigation controls.
    # A dedicated --user-data-dir keeps this isolated from the user's normal
    # Edge profile, and means closing this window ends its own session
    # cleanly (sessionStorage-based login in the web app clears with it).
    $profileDir = Join-Path $appDataDir "EdgeProfile"
    Start-Process -FilePath $edge -ArgumentList @(
      "--app=$url",
      "--user-data-dir=`"$profileDir`"",
      "--window-size=1440,900",
      "--no-first-run",
      "--no-default-browser-check"
    )
    return
  }

  # Edge isn't on this machine — fall back to Firefox. Firefox has no
  # equivalent "app mode" (Mozilla removed it years ago), so this opens a
  # normal Firefox window with the usual address bar/tabs.
  $ffCandidates = @(
    "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
    "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"
  )
  $firefox = $ffCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($firefox -and (Test-Path $firefox)) {
    Start-Process -FilePath $firefox -ArgumentList @("-new-window", $url)
    return
  }

  [System.Windows.Forms.MessageBox]::Show(
    "Neither Microsoft Edge nor Mozilla Firefox was found on this computer. One of them is required to run Universal Core ERP Solution.",
    "Universal Core ERP Solution", "OK", "Error"
  ) | Out-Null
}

# ══════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════
$config = Load-Config
$isFirstRun = $null -eq $config

if ($isFirstRun) {
  $config = Show-SettingsDialog $null
  if (-not $config) { exit 0 }  # user cancelled setup — nothing to run yet
  Save-Config $config
  Set-StartWithWindows $config.StartWithWindows
}

Open-ErpWindow $config.ServerUrl

# ── System tray icon — keeps "Change Server Link" reachable at any time,
#    logged in or out, without hunting for the original exe again. ──
$iconPath = Join-Path $here "app.ico"
$trayIcon = New-Object System.Windows.Forms.NotifyIcon
$trayIcon.Text = "Universal Core ERP Solution"
if (Test-Path $iconPath) { $trayIcon.Icon = New-Object System.Drawing.Icon($iconPath) }
else { $trayIcon.Icon = [System.Drawing.SystemIcons]::Application }
$trayIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miOpen = $menu.Items.Add("Open Universal Core ERP")
$miChange = $menu.Items.Add("Change Server Link...")
[void]$menu.Items.Add("-")
$miExit = $menu.Items.Add("Exit")
$trayIcon.ContextMenuStrip = $menu

$miOpen.Add_Click({ Open-ErpWindow $config.ServerUrl })
$trayIcon.Add_DoubleClick({ Open-ErpWindow $config.ServerUrl })

$miChange.Add_Click({
  $updated = Show-SettingsDialog $config
  if ($updated) {
    $script:config = $updated
    Save-Config $config
    Set-StartWithWindows $config.StartWithWindows
    [System.Windows.Forms.MessageBox]::Show("Saved. Use 'Open Universal Core ERP' from the tray icon to use the new link.", "Universal Core ERP Solution", "OK", "Information") | Out-Null
  }
})

$miExit.Add_Click({
  $trayIcon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

[System.Windows.Forms.Application]::Run()
