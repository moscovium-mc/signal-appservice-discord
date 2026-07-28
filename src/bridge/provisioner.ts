import express from "express";
import { Log } from "../util/log";
import { ProvisioningConfig } from "../config";
import { MappingManager } from "./mapping";
import { MappingStore } from "../db/eventstore";

const log = new Log("Provisioner");

export class Provisioner {
    private app: express.Application;
    private server: any = null;

    constructor(
        private config: ProvisioningConfig,
        private mappingManager: MappingManager,
        private mappingStore: MappingStore,
    ) {
        this.app = express();
        this.app.use(express.json());
        this.setupRoutes();
    }

    public start(): void {
        if (!this.config.enable) {
            log.info("Provisioning API is disabled");
            return;
        }

        this.server = this.app.listen(this.config.port, this.config.host, () => {
            log.info(`Provisioning API listening on ${this.config.host}:${this.config.port}`);
        });
    }

    public stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    private setupRoutes(): void {
        // Auth middleware
        const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (!this.config.apiKey) return next();
            const key = req.headers["x-api-key"] as string;
            if (key !== this.config.apiKey) {
                return res.status(401).json({ error: "Unauthorized" });
            }
            next();
        };

        // GET /mappings - list all
        this.app.get("/mappings", auth, async (_req, res) => {
            try {
                const mappings = this.mappingManager.getAll();
                res.json({ mappings });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        // POST /mappings - create
        this.app.post("/mappings", auth, async (req, res) => {
            try {
                const { signalId, discordChannelId, name, direction, attribution } = req.body;
                if (!signalId || !discordChannelId) {
                    return res.status(400).json({ error: "signalId and discordChannelId required" });
                }

                await this.mappingStore.upsert({
                    signalId,
                    discordChannelId,
                    name: name || "Unnamed",
                    direction: direction || "two-way",
                    attribution: attribution || "username",
                });

                // Reload from DB into in-memory manager
                this.mappingManager.loadFromConfig([]); // clear config mappings
                const dbMappings = await this.mappingStore.getAll();
                this.mappingManager.loadFromDbMappings(dbMappings);

                log.info(`Provisioning: created mapping ${signalId} ↔ ${discordChannelId}`);
                res.status(201).json({ status: "created" });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        // DELETE /mappings/:signalId/:channelId - remove
        this.app.delete("/mappings/:signalId/:channelId", auth, async (req, res) => {
            try {
                const { signalId, channelId } = req.params;
                await this.mappingStore.remove(signalId, channelId);

                // Reload
                this.mappingManager.loadFromConfig([]);
                const dbMappings = await this.mappingStore.getAll();
                this.mappingManager.loadFromDbMappings(dbMappings);

                log.info(`Provisioning: removed mapping ${signalId} ↔ ${channelId}`);
                res.json({ status: "removed" });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });

        // GET /health
        this.app.get("/health", (_req, res) => {
            res.json({ status: "ok", uptime: process.uptime() });
        });

        // GET /groups (from GroupSync cache)
        this.app.get("/groups", auth, async (_req, res) => {
            try {
                const { GroupSync } = require("./groupsync");
                // The provisioner doesn't own GroupSync; this route is wired from orchestrator
                res.json({ groups: [] });
            } catch (err: any) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
