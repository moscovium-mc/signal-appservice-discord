export const CURRENT_SCHEMA = 1;

export interface IDatabaseConnector {
    Open(): void;
    Close(): Promise<void>;
    Run(sql: string, params?: any): Promise<void>;
    Get(sql: string, params?: any): Promise<any>;
    All(sql: string, params?: any): Promise<any[]>;
    Exec(sql: string): Promise<void>;
}

import Database = require("better-sqlite3");
import { Log } from "../util/log";
import path = require("path");

const log = new Log("SQLite3");

export class SQLite3Connector implements IDatabaseConnector {
    private db: Database.Database;

    constructor(private filePath: string) {}

    public Open(): void {
        this.db = new Database(this.filePath);
        this.db.pragma("journal_mode = WAL");
        log.info(`Opened SQLite database at ${this.filePath}`);
    }

    public async Close(): Promise<void> {
        this.db.close();
    }

    public async Run(sql: string, params?: any): Promise<void> {
        if (params) { this.db.prepare(sql).run(params); } else { this.db.prepare(sql).run(); }
    }

    public async Get(sql: string, params?: any): Promise<any> {
        if (params) { return this.db.prepare(sql).get(params); } else { return this.db.prepare(sql).get(); }
    }

    public async All(sql: string, params?: any): Promise<any[]> {
        if (params) { return this.db.prepare(sql).all(params); } else { return this.db.prepare(sql).all(); }
    }

    public async Exec(sql: string): Promise<void> {
        this.db.exec(sql);
    }
}

export class EventStoreEntry {
    constructor(
        public id: string,
        public signalTimestamp: string,
        public signalSource: string,
        public discordMessageId: string,
        public discordChannelId: string,
        public direction: "signal-to-discord" | "discord-to-signal",
        public createdAt: number = Date.now(),
    ) {}
}

export class EventStore {
    private db: IDatabaseConnector;

    constructor(db: IDatabaseConnector) {
        this.db = db;
    }

    public async init(): Promise<void> {
        await this.db.Exec(`
            CREATE TABLE IF NOT EXISTS event_store (
                id TEXT PRIMARY KEY,
                signal_timestamp TEXT NOT NULL,
                signal_source TEXT NOT NULL,
                discord_message_id TEXT NOT NULL,
                discord_channel_id TEXT NOT NULL,
                direction TEXT NOT NULL CHECK(direction IN ('signal-to-discord', 'discord-to-signal')),
                created_at INTEGER NOT NULL
            )
        `);
        await this.db.Exec(`
            CREATE INDEX IF NOT EXISTS idx_event_store_discord
            ON event_store(discord_message_id, discord_channel_id)
        `);
        await this.db.Exec(`
            CREATE INDEX IF NOT EXISTS idx_event_store_signal
            ON event_store(signal_timestamp, signal_source)
        `);
    }

    public async insert(entry: EventStoreEntry): Promise<void> {
        await this.db.Run(
            `INSERT INTO event_store (id, signal_timestamp, signal_source, discord_message_id, discord_channel_id, direction, created_at)
             VALUES ($id, $signalTimestamp, $signalSource, $discordMessageId, $discordChannelId, $direction, $createdAt)`,
            {
                id: entry.id,
                signalTimestamp: entry.signalTimestamp,
                signalSource: entry.signalSource,
                discordMessageId: entry.discordMessageId,
                discordChannelId: entry.discordChannelId,
                direction: entry.direction,
                createdAt: entry.createdAt,
            },
        );
    }

    public async getByDiscordId(discordMessageId: string, discordChannelId: string): Promise<EventStoreEntry | null> {
        const row = await this.db.Get(
            `SELECT * FROM event_store WHERE discord_message_id = $id AND discord_channel_id = $channel`,
            { id: discordMessageId, channel: discordChannelId },
        );
        if (!row) return null;
        return new EventStoreEntry(
            row.id, row.signal_timestamp, row.signal_source,
            row.discord_message_id, row.discord_channel_id,
            row.direction, row.created_at,
        );
    }

    public async getBySignalId(signalTimestamp: string, signalSource: string): Promise<EventStoreEntry | null> {
        const row = await this.db.Get(
            `SELECT * FROM event_store WHERE signal_timestamp = $ts AND signal_source = $src`,
            { ts: signalTimestamp, src: signalSource },
        );
        if (!row) return null;
        return new EventStoreEntry(
            row.id, row.signal_timestamp, row.signal_source,
            row.discord_message_id, row.discord_channel_id,
            row.direction, row.created_at,
        );
    }

    public async delete(id: string): Promise<void> {
        await this.db.Run(`DELETE FROM event_store WHERE id = $id`, { id });
    }
}

export class MappingStore {
    private db: IDatabaseConnector;

    constructor(db: IDatabaseConnector) {
        this.db = db;
    }

    public async init(): Promise<void> {
        await this.db.Exec(`
            CREATE TABLE IF NOT EXISTS mappings (
                signal_id TEXT NOT NULL,
                discord_channel_id TEXT NOT NULL,
                name TEXT NOT NULL,
                direction TEXT NOT NULL,
                attribution TEXT NOT NULL,
                PRIMARY KEY (signal_id, discord_channel_id)
            )
        `);
    }

    public async upsert(mapping: {
        signalId: string;
        discordChannelId: string;
        name: string;
        direction: string;
        attribution: string;
    }): Promise<void> {
        await this.db.Run(
            `INSERT OR REPLACE INTO mappings (signal_id, discord_channel_id, name, direction, attribution)
             VALUES ($signalId, $discordChannelId, $name, $direction, $attribution)`,
            mapping,
        );
    }

    public async getBySignalId(signalId: string): Promise<any[]> {
        const rows = await this.db.All(
            `SELECT * FROM mappings WHERE signal_id = $id`,
            { id: signalId },
        );
        return rows.map(this.mapRow);
    }

    public async getByDiscordChannel(discordChannelId: string): Promise<any[]> {
        const rows = await this.db.All(
            `SELECT * FROM mappings WHERE discord_channel_id = $id`,
            { id: discordChannelId },
        );
        return rows.map(this.mapRow);
    }

    public async getAll(): Promise<any[]> {
        return this.db.All(`SELECT * FROM mappings`);
    }

    public async remove(signalId: string, discordChannelId: string): Promise<void> {
        await this.db.Run(
            `DELETE FROM mappings WHERE signal_id = $signalId AND discord_channel_id = $discordChannelId`,
            { signalId, discordChannelId },
        );
    }

    private mapRow(row: any): any {
        if (!row) return row;
        return {
            signalId: row.signal_id,
            discordChannelId: row.discord_channel_id,
            name: row.name,
            direction: row.direction,
            attribution: row.attribution,
            signalIsGroup: !row.signal_id?.startsWith("+"),
        };
    }
}
