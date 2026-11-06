import { createClient } from "redis";
import { requireEnv } from "./config";

const connect = async () => {
  const c = createClient({ url: requireEnv("REDIS_URL"), socket: { connectTimeout: 3_000 } });
  c.on("error", () => {});
  await c.connect();
  return c;
};

let client: ReturnType<typeof connect> | undefined;

/** LEAP Redis, read-only use (HGET/GET only). REDIS_URL e.g. redis://host:6379/0 */
export function redis(): ReturnType<typeof connect> {
  const pending =
    client ??
    connect().catch((err) => {
      client = undefined;
      throw err;
    });
  client = pending;
  return pending;
}
