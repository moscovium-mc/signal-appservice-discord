import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import { Config } from "./config";
import { Log, LogConfig } from "./util/log";
import { SignalClient } from "./signal/client";
import { DiscordBot } from "./discord/bot";
import { Orchestrator } from "./bridge/orchestrator";
import { SQLite3Connector, EventStore, MappingStore } from "./db/eventstore";

const log = new Log("Main");

interface CliOptions {
    config: string;
    port?: number;
}

function parseArgs(): CliOptions {
    const args = process.argv.slice(2);
    const opts: CliOptions = { config: "config/config.yaml" };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "-c" || args[i] === "--config") {
            opts.config = args[++i] || opts.config;
        }
        if (args[i] === "-p" || args[i] === "--port") {
            opts.port = parseInt(args[++i], 10) || undefined;
        }
    }
    return opts;
}

async function start(): Promise<void> {
    const opts = parseArgs();
    const configPath = path.resolve(opts.config);

    if (!fs.existsSync(configPath)) {
        console.error(`Config file not found: ${configPath}`);
        console.error("Copy config/config.sample.yaml to config.yaml and edit it.");
        process.exit(1);
    }

    const config = new Config();
    const rawConfig = yaml.load(fs.readFileSync(configPath, "utf8")) as any;
    config.applyConfig(rawConfig);

    Log.Configure(config.logging);
    log.info("Starting signal-appservice-discord");

    const dbPath = config.database.filename || "bridge.db";
    const dbDir = path.dirname(dbPath);
    if (dbDir && !fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new SQLite3Connector(dbPath);
    db.Open();
    const eventStore = new EventStore(db);
    const mappingStore = new MappingStore(db);
    await eventStore.init();
    await mappingStore.init();
    log.info("Database initialized");

    const signalClient = new SignalClient(config.signal);

    const discordBot = new DiscordBot(
        config.discord,
        config.limits,
        eventStore,
        mappingStore,
    );

    const orchestrator = new Orchestrator(
        config,
        signalClient,
        discordBot,
        eventStore,
        mappingStore,
    );
    await orchestrator.init();

    signalClient.start().then(() => {
        log.info("Signal client connected");
    }).catch((err) => {
        log.error("Failed to start Signal client:", err);
    });

    try {
        await discordBot.start();
        log.info("Discord bot connected");
    } catch (err) {
        log.error("Failed to start Discord bot:", err);
        process.exit(1);
    }

    await new Promise((r) => setTimeout(r, 3000));
    orchestrator.start();

    log.info("Bridge is running. Press Ctrl+C to stop.");

    const shutdown = async () => {
        log.info("Shutting down...");
        orchestrator.stop();
        await signalClient.stop();
        await discordBot.stop();
        await db.Close();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

process.on("uncaughtException", (err) => {
    log.error("Uncaught exception:", err);
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    log.error("Unhandled rejection:", reason);
});

start().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
