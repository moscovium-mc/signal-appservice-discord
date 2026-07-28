# Edit these paths for your system
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.0.0-hotspot"
$account = "+15551234567"
$cli = "$env:USERPROFILE\signal-cli\signal-cli-0.14.6\bin\signal-cli.bat"

# Kill stale java processes holding port 7583
try { $c = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 7583); $c.Close(); Get-Process -Name java | Stop-Process -Force; Start-Sleep 3 } catch {}

$log = Join-Path (Split-Path $PSCommandPath -Parent) "logs\daemon.log"
& $cli -a $account daemon --tcp 127.0.0.1:7583 2>&1 | Out-File -LiteralPath $log -Encoding utf8