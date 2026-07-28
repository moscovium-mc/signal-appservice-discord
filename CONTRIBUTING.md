# Contributing

Thanks for your interest in improving the Signal ↔ Discord bridge!

## Getting Started

1. Fork the repo
2. Run `npm install`
3. Run `npm run build` to compile
4. Make your changes
5. Run `npm run lint` to check code style
6. Run `npm test` to run tests
7. Submit a PR

## Code Style

- TypeScript with strict mode
- 4-space indentation
- No semicolons omitted by choice (the project uses them)
- Prefer async/await over raw promises
- All public methods should have JSDoc comments

## What Needs Help

- **Tests**: The project has minimal test coverage. Adding tests for the message processors, mapping logic, and event store would be very valuable.
- **Attachment handling**: More robust attachment download/resize/retry logic.
- **Admin tools**: CLI tools for managing mappings without editing config.
- **Web UI**: A simple status dashboard.

## PR Guidelines

- One feature/fix per PR
- Include test coverage for new code
- Update documentation if changing config or behavior
- Add a changelog entry

## Architecture Overview

The bridge has four layers:

1. **signal-cli** - handles Signal protocol (crypto, device linking, message delivery)
2. **SignalClient** - JSON-RPC client connected to signal-cli daemon, receives push notifications
3. **Orchestrator** - routes parsed messages between Signal and Discord using mappings
4. **DiscordBot** - Discord.js client that sends/receives Discord messages via webhooks

Messages flow through `MessageProcessor` classes that convert platform-specific formats into a shared internal format. Senders are tagged with `[Signal]` on Discord and `[Discord]` on Signal for directional clarity. The `EventStore` prevents duplicate bridging (echo loops).

## Need Help?

Open an issue or start a discussion on GitHub.
