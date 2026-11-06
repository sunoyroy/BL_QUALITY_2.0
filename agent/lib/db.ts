import pg from "pg";
import { requireEnv } from "./config";
import { SourceError } from "./envelope";

/**
 * Read-only Postgres access. Every query is a fixed SQL string defined in a tool;
 * the model never supplies SQL. Sessions are forced read-only at the server.
 *
 *   PG_IMBUYREC_R_URL  imbl report replica (ETO_OFR, DIR_QUERY_FREE, WhatsApp, GLCAT)
 *   PG_ENQ_R_URL       enquiry DB (PNS_CALL_ALL_RECORDS)
 *   PG_LEAP_ML_URL     postgreML (leap_blml_agent_audit_log)
 */
export type Database = "PG_IMBUYREC_R_URL" | "PG_ENQ_R_URL" | "PG_LEAP_ML_URL";

const pools = new Map<Database, pg.Pool>();

function pool(db: Database): pg.Pool {
  let p = pools.get(db);
  if (!p) {
    p = new pg.Pool({
      connectionString: requireEnv(db),
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      options: "-c default_transaction_read_only=on",
    });
    pools.set(db, p);
  }
  return p;
}

export async function query<T extends Record<string, unknown>>(
  db: Database,
  sql: string,
  params: unknown[],
  timeoutMs = 10_000,
): Promise<T[]> {
  try {
    const result = await pool(db).query<T>({ text: sql, values: params, query_timeout: timeoutMs } as pg.QueryConfig);
    return result.rows;
  } catch (err) {
    if (err instanceof SourceError) throw err;
    const message = (err as Error).message ?? String(err);
    if (/timeout/i.test(message)) throw new SourceError("TIMEOUT", `${db} query timed out after ${timeoutMs} ms`);
    if (/permission denied|password authentication/i.test(message)) throw new SourceError("DENIED", `${db}: ${message}`);
    throw new SourceError("ERROR", `${db}: ${message}`);
  }
}
