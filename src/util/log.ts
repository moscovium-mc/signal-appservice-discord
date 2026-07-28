import * as winston from "winston";
import * as path from "path";

interface LoggingFileConfig {
    file: string;
    level?: string;
}

export class Log {
    private static rootLogger: winston.Logger;

    public static Configure(config: LogConfig) {
        const transports: winston.transport[] = [
            new winston.transports.Console({
                level: config.console,
                format: winston.format.combine(
                    winston.format.timestamp({ format: config.lineDateFormat }),
                    winston.format.colorize(),
                    winston.format.printf(({ timestamp, level, message, module }) => {
                        return `${timestamp} [${module}] ${level}: ${message}`;
                    }),
                ),
            }),
        ];

        if (config.files) {
            for (const fc of config.files) {
                const dir = path.dirname(fc.file);
                if (dir) {
                    try {
                        const fs = require("fs");
                        fs.mkdirSync(dir, { recursive: true });
                    } catch { }
                }
                transports.push(new winston.transports.File({
                    filename: fc.file,
                    level: fc.level || "verbose",
                    format: winston.format.combine(
                        winston.format.timestamp({ format: config.lineDateFormat }),
                        winston.format.printf(({ timestamp, level, message, module }) => {
                            return `${timestamp} [${module}] ${level}: ${message}`;
                        }),
                    ),
                    options: { flags: "w" },
                }));
            }
        }

        this.rootLogger = winston.createLogger({ transports });
    }

    constructor(private module: string) {}

    public silly(...args: any[]) { this.log("silly", args); }
    public verbose(...args: any[]) { this.log("verbose", args); }
    public info(...args: any[]) { this.log("info", args); }
    public warn(...args: any[]) { this.log("warn", args); }
    public error(...args: any[]) { this.log("error", args); }

    private log(level: string, args: any[]) {
        const logger = Log.rootLogger || winston.createLogger({
            transports: [new winston.transports.Console({ level: "info" })],
        });
        const message = args.map((a) => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" ");
        logger.log(level, message, { module: this.module });
    }
}

export class LogConfig {
    public console: string = "info";
    public lineDateFormat: string = "MMM-D HH:mm:ss.SSS";
    public files: LoggingFileConfig[] = [];
}
