# Configure these paths for your system
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.0.0-hotspot"
$cli = "$env:USERPROFILE\signal-cli\signal-cli-0.14.6\bin\signal-cli.bat"
$account = "+15551234567"

# Start signal-cli in daemon mode with TCP listener
Write-Host "Starting signal-cli daemon for $account on 127.0.0.1:7583..."
& $cli -a $account daemon --tcp 127.0.0.1:7583
