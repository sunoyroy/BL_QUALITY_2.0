import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireEnv, optionalEnv } from "../lib/config";
import { withEnvelope } from "../lib/envelope";
import { httpJson } from "../lib/http";
import { redis } from "../lib/redis";

interface UnitPrice {
  unit_display_name?: string;
  q1?: number;
  median?: number;
  q3?: number;
}

export default defineTool({
  description:
    "Get the usual price and order-quantity range for an MCAT and unit: price Q1/median/Q3 (mcatunittov, last 3 months) and the " +
    "distribution of BL quantities (p25-p99 from Redis MCAT_QTY_STATS). Use as an anomaly signal for quantity/unit only; " +
    "never rewrite a quantity to the 'normal' value.",
  inputSchema: z.object({
    mcat_id: z.number().int().positive(),
    unit: z.string().min(1).describe("Quantity unit as on the BL, e.g. 'Piece', 'Kg'"),
  }),
  label: { start: ({ mcat_id, unit }) => `Fetch price/quantity stats for MCAT ${mcat_id} (${unit})` },
  async execute({ mcat_id, unit }, ctx) {
    return withEnvelope("get_mcat_quantity_stats", mcat_id, ["mcatunittov", "redis:MCAT_QTY_STATS"], async ({ partial }) => {
      const record: Record<string, unknown> = { mcat_id, unit, price: null, quantity: null };

      try {
        const headers: Record<string, string> = { "Content-Type": "text/plain" };
        const forwardedFor = optionalEnv("MCAT_PRICE_FORWARDED_FOR");
        if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;
        const body = await httpJson<{ response?: string | Record<string, unknown> }>(requireEnv("MCAT_PRICE_URL"), {
          json: { inmcatid: String(mcat_id), indurationid: "3", AK: requireEnv("DEVTRON_AK") },
          headers,
          timeoutMs: 6_000,
          signal: ctx.abortSignal,
        });
        const parsed = typeof body.response === "string" ? JSON.parse(body.response) : (body.response ?? body);
        const match = ((parsed?.UNIT_STR ?? []) as UnitPrice[]).find(
          (u) => (u.unit_display_name ?? "").toLowerCase() === unit.toLowerCase(),
        );
        record.price = match ? { q1: match.q1, median: match.median, q3: match.q3, unit: match.unit_display_name } : null;
        if (!match) partial(`No price bucket for unit "${unit}" in this MCAT.`);
      } catch (err) {
        partial(`Price stats unavailable: ${(err as Error).message}`);
      }

      try {
        const field = unit.toLowerCase().trim().replace(/\s+/g, " ");
        const raw = await (await redis()).hGet(`MCAT_QTY_STATS:${mcat_id}`, field);
        if (raw) {
          const s = JSON.parse(raw);
          record.quantity = { bl_count: s.bl_count, p25: s.p25, p50: s.p50, p75: s.p75, p90: s.p90, p95: s.p95, p99: s.p99 };
        } else {
          partial(`No quantity distribution for unit "${unit}" in this MCAT.`);
        }
      } catch (err) {
        partial(`Quantity stats unavailable: ${(err as Error).message}`);
      }

      return { records: record.price || record.quantity ? [record] : [] };
    });
  },
});
