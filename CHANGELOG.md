# Changelog

## 1.0.0

Initial release.

### Features

- Bidirectional Signal ↔ Discord message relay for DMs and group chats
- Attribution tags: `[Signal]` prefix on Discord, `[Discord]` prefix on Signal
- Webhook-based user attribution (messages appear with sender's name/avatar)
- Privacy-first display: Signal profile name → config contacts → sanitized fallback
- Configurable phone-to-username mapping for privacy
- Scope-based mapping filtering (`scope: "group"` prevents DM leaks)
- Attachment forwarding (images, files)
- Deduplication via SQLite EventStore (prevents echo loops)
- Typing indicator forwarding (Discord → Signal)
- Auto-restart crash resilience with exponential backoff
- Prometheus metrics endpoint
- Optional provisioning REST API for runtime mapping management
- Docker support

### Infrastructure

- Windows launcher scripts (start-bridge.bat, stop-bridge.bat, start-daemon.bat, start-daemon.ps1)
- signal-cli JSON-RPC daemon mode (TCP port) with push notification delivery exclusively
- Winston logging with file output
- Config validation via typed classes

### Fixes

- DM leak: group-only mappings no longer trigger on DMs (add `scope: "group"` to prevent DMs from matching)
- Profile cache returns null instead of `Signal-XXXX` fallback for unknown contacts
- CLI receive subprocess removed (broken in daemon mode) - push notifications only
- Em dashes replaced with regular dashes throughout documentation
- Build output now properly tracked via `postinstall` script

### Supported signal-cli

- v0.14.x (tested)
- Requires Java 21+
