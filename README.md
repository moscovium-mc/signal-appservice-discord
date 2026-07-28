# Signal ↔ Discord Bridge

A bridge between [Signal](https://signal.org/) and [Discord](https://discord.com/), built for people who want to keep in touch with friends on Discord without compromising their privacy.

The bridge runs as a **linked Signal device** via `signal-cli`, connects to Discord as a bot, and relays messages bidirectionally between mapped Signal chats (DMs and groups) and Discord channels.

## Architecture

```
Signal Network <--E2E--> signal-cli (JSON-RPC daemon) <--TCP--> Bridge <--REST/WS--> Discord
```

- **signal-cli** handles all Signal-specific crypto (E2EE, device linking, group management). In daemon mode, it delivers incoming messages as JSON-RPC push notifications to the bridge.
- **Bridge** (TypeScript/Node.js) routes messages, manages channel mappings, stores events for dedup, and processes display names.
- **Discord.js** handles Discord connectivity with webhook-based user attribution.

## Features

- ✅ Bidirectional relay: Signal ↔ Discord (DMs and groups)
- ✅ Group chat support with base64 group IDs
- ✅ Webhook attribution (messages appear under the sender's name/avatar)
- ✅ Attachment forwarding (images, files) from both sides
- ✅ Deduplication - EventStore prevents echo loops
- ✅ Privacy-first display - priority: Signal profile name → config contacts → sanitized fallback
- ✅ Configurable phone-to-username mapping via `contacts:`
- ✅ Typing indicator forwarding (Discord → Signal)
- ✅ SQLite (built-in) or PostgreSQL
- ✅ Docker support
- ✅ Auto-restart crash resilience
- ✅ Prometheus metrics endpoint

## Prerequisites

- **Node.js 18+**
- **Java 21+** (required by signal-cli 0.14+)
- **signal-cli 0.14+** - [install](https://github.com/AsamK/signal-cli) and link to your phone number
- A **Discord application** with a bot token (create at [Discord Developer Portal](https://discord.com/developers/applications))

## Quick Start

```bash
# Clone and install
git clone https://github.com/moscovium-mc/signal-appservice-discord
cd signal-appservice-discord
npm install

# Configure
cp config/config.sample.yaml config/config.yaml
# Edit config.yaml with your Signal account, Discord token, and channel mappings

# Link signal-cli to your phone number
signal-cli -a +15551234567 link -n "bridge"

# Start the signal-cli daemon (terminal 1)
signal-cli -a +15551234567 daemon --tcp 127.0.0.1:7583

# Start the bridge (terminal 2)
npm start
```

### Windows Quick Start

Use the included launcher scripts:
- `start-bridge.bat` - launches daemon + bridge with auto-restart
- `start-daemon.ps1` - launches just the daemon
- `stop-bridge.bat` - stops everything

Set `JAVA_HOME` in `start-daemon.ps1` to your Java installation path.

### Docker

```bash
docker-compose up -d
```

## Configuration

See [`config/config.sample.yaml`](config/config.sample.yaml) for all options.

### Minimal config:

```yaml
signal:
  account: "+15551234567"
  host: "127.0.0.1"
  port: 7583
  cliPath: "/usr/bin/signal-cli"

discord:
  token: "YOUR_BOT_TOKEN_HERE"
  usePrivilegedIntents: true

mappings:
  - name: "My Group"
    signal: "group_base64_id"
    discord: "123456789012345678"
    direction: "two-way"
    attribution: "webhook"
    scope: "group"

database:
  filename: "data/bridge.db"

logging:
  console: "info"
  files:
    - file: "logs/bridge.log"
      level: "verbose"
```

### Getting a Signal Group ID

```bash
signal-cli -a +15551234567 listGroups
```

The output includes base64-encoded group IDs. Use these in your `mappings[].signal` field.

### Finding a Discord Channel ID

Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode), right-click a channel, and select "Copy ID".

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Daemon won't start | Wrong Java version | Set `JAVA_HOME` to JDK 21+ |
| Bridge can't connect | Daemon not running or wrong port | Check daemon is on `127.0.0.1:7583` |
| Messages not bridging | Daemon not subscribed to account | Check daemon connects with `-a ACCOUNT` flag |
| Phone numbers showing in Discord | No `sourceName` in envelope, no contact mapping | Add `contacts:` entries to config.yaml |
| Duplicate messages | EventStore dedup not working | Check database path is writable |
| Messages from others don't arrive | Not yet received - daemon delivers all via push notifications | Enable `console: "verbose"` and check logs for `SIGNAL_RECEIVE` lines |

## License

AGPL-3.0. See [LICENSE](LICENSE).

Built with [signal-cli](https://github.com/AsamK/signal-cli) and [Discord.js](https://discord.js.org/).
