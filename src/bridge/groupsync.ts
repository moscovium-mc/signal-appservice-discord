import { Log } from "../util/log";
import { SignalClient } from "../signal/client";
import { MappingManager } from "./mapping";

const log = new Log("GroupSync");

export interface SignalGroupInfo {
    groupId: string;
    name: string;
    members: string[];
    isBlocked: boolean;
}

export class GroupSync {
    private timer: NodeJS.Timeout | null = null;
    private cachedGroups: Map<string, SignalGroupInfo> = new Map();

    constructor(
        private signalClient: SignalClient,
        private mappingManager: MappingManager,
        private intervalMs: number,
    ) {}

    public start(): void {
        log.info(`Group sync starting every ${this.intervalMs / 1000}s`);
        this.sync().catch((err) => log.error("Initial group sync failed:", err));
        this.timer = setInterval(() => {
            this.sync().catch((err) => log.error("Group sync failed:", err));
        }, this.intervalMs);
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    public getGroup(groupId: string): SignalGroupInfo | undefined {
        return this.cachedGroups.get(groupId);
    }

    public getAllGroups(): SignalGroupInfo[] {
        return Array.from(this.cachedGroups.values());
    }

    private async sync(): Promise<void> {
        try {
            const groups = await this.signalClient.listGroups();
            if (!Array.isArray(groups) || groups.length === 0) {
                log.verbose("No groups returned from signal-cli");
                return;
            }

            let updated = 0;
            for (const g of groups) {
                const groupId = g.groupId;
                if (!groupId) continue;

                const info: SignalGroupInfo = {
                    groupId,
                    name: g.name || g.title || "Unnamed Group",
                    members: (g.members || []).map((m: any) => m.uuid || m.number || m),
                    isBlocked: g.isBlocked || false,
                };

                this.cachedGroups.set(groupId, info);
                updated++;
            }

            log.info(`Synced ${updated} groups (${this.cachedGroups.size} cached)`);
        } catch (err) {
            log.error("Error syncing groups:", err);
        }
    }
}
