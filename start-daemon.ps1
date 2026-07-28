# === EDIT THESE for your system ===
$env:JAVA_HOME = "C:\Path\To\Java-21+"
$account = "+15551234567"
$cli = "C:\Path\To\signal-cli\bin\signal-cli.bat"

# Kill stale java processes holding port 7583
try { $c = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 7583); $c.Close(); Get-Process -Name java | Stop-Process -Force; Start-Sleep 3 } catch {}

$log = Join-Path (Split-Path $PSCommandPath -Parent) "logs\daemon.log"
& $cli -a $account daemon --tcp 127.0.0.1:7583 2>&1 | Out-File -LiteralPath $log -Encoding utf8