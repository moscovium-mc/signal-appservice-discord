import { IDatabaseConnector } from "./eventstore";
import { Log } from "../util/log";

const log = new Log("Postgres");

export class PostgresConnector implements IDatabaseConnector {
    private db: any;
    private pgp: any;

    constructor(private connString: string) {
        this.pgp = require("pg-promise")();
    }

    public Open(): void {
        this.db = this.pgp(this.connString);
        log.info("Connected to PostgreSQL");
    }

    public async Close(): Promise<void> {
        this.pgp.end();
    }

    public async Run(sql: string, params?: any): Promise<void> {
        await this.db.none(sql, params);
    }

    public async Get(sql: string, params?: any): Promise<any> {
        return this.db.oneOrNone(sql, params);
    }

    public async All(sql: string, params?: any): Promise<any[]> {
        return this.db.any(sql, params);
    }

    public async Exec(sql: string): Promise<void> {
        await this.db.none(sql);
    }
}
