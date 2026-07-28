# Changelog

## 1.0.0 (2026-07-28)

Initial release.

### Features

- Bidirectional Signal ↔ Discord message relay for DMs and group chats
- Webhook-based user attribution (messages appear with sender's name/avatar)
- Privacy-first display: Signal profile name → config contacts → sanitized fallback
- Configurable phone-to-username mapping for privacy
- Attachment forwarding (images, files)
- Deduplication via SQLite EventStore (prevents echo loops)
- Typing indicator forwarding (Discord → Signal)
- Auto-restart crash resilience with exponential backoff
- Prometheus metrics endpoint
- Optional provisioning REST API for runtime mapping management
- Docker support

### Infrastructure

- Windows launcher scripts (start-bridge.bat, stop-bridge.bat, start-daemon.ps1)
- signal-cli JSON-RPC daemon mode (TCP port) with push notification delivery
- Winston logging with file output
- Config validation via typed classes

### Supported signal-cli

- v0.14.x (tested)
- Requires Java 21+
