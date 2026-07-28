const ENV_PREFIX = "SIGNAL_BRIDGE";

export class Config {
    public signal: SignalConfig = new SignalConfig();
    public discord: DiscordConfig = new DiscordConfig();
    public mappings: MappingConfig[] = [];
    public database: DatabaseConfig = new DatabaseConfig();
    public logging: LoggingConfig = new LoggingConfig();
    public limits: LimitsConfig = new LimitsConfig();
    public metrics: MetricsConfig = new MetricsConfig();
    public provisioning: ProvisioningConfig = new ProvisioningConfig();
    public groupsync: GroupSyncConfig = new GroupSyncConfig();
    public contacts: { [phone: string]: string } = {};

    public applyConfig(newConfig: any, configLayer: any = this) {
        for (const key of Object.keys(newConfig)) {
            if (configLayer[key] instanceof Object && !(configLayer[key] instanceof Array)) {
                this.applyConfig(newConfig[key], configLayer[key]);
            } else {
                configLayer[key] = newConfig[key];
            }
        }
    }
}

export class SignalConfig {
    public cliPath: string = "/usr/bin/signal-cli";
    public account: string = "";
    public socketPath: string = "/tmp/signal-cli-socket";
    public host: string = "";
    public port: number = 0;
    public mode: "native" | "external" = "native";
    public attachmentDir: string = "/tmp/signal-attachments";
}

export class DiscordConfig {
    public token: string = "";
    public usePrivilegedIntents: boolean = false;
    public disableTypingNotifications: boolean = false;
    public disableDeletionForwarding: boolean = false;
}

export class MappingConfig {
    public name: string = "";
    public signal: string = "";
    public discord: string = "";
    public direction: "two-way" | "signal-to-discord" | "discord-to-signal" = "two-way";
    public attribution: "username" | "webhook" = "username";
    public scope: "any" | "group" | "dm" = "any";
}

export class DatabaseConfig {
    public filename: string = "data/bridge.db";
    public connString: string = "";
}

export class LoggingFileConfig {
    public file: string = "";
    public level: string = "info";
    public maxFiles: string = "14d";
    public maxSize: string = "50m";
}

export class LoggingConfig {
    public console: string = "info";
    public lineDateFormat: string = "MMM-D HH:mm:ss.SSS";
    public files: LoggingFileConfig[] = [];
}

export class LimitsConfig {
    public discordSendDelay: number = 1500;
    public maxFileSize: number = 8000000;
}

export class MetricsConfig {
    public enable: boolean = false;
    public port: number = 9001;
    public host: string = "127.0.0.1";
}

export class ProvisioningConfig {
    public enable: boolean = false;
    public port: number = 9006;
    public host: string = "127.0.0.1";
    public apiKey: string = "";
}

export class GroupSyncConfig {
    public interval: number = 300000;
    public enable: boolean = true;
}
