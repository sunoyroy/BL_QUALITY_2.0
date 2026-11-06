import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireEnv } from "../lib/config";
import { query } from "../lib/db";
import { SourceError, withEnvelope } from "../lib/envelope";
import { httpJson } from "../lib/http";
import { compactToIso, daysAgo, istCompact } from "../lib/time";

interface BizfeedResponse {
  CODE?: string | number;
  MESSAGE?: string;
  DETAILS?: Record<string, unknown>[];
}

// PNS calls placed by the buyer; status 52, 67 or 20 means the call connected (LeapPnsIntentWorker PNSW28).
const PNS_SQL = `
SELECT pns_call_record_date AS called_at, pns_call_mcat_id AS mcat_id, pns_call_modrefname AS product_name,
       pns_call_receiver_glusr_id AS seller_glusr_id, pns_call_source_modid AS modid,
       pns_call_status AS call_status, pns_call_duration AS duration_seconds
FROM pns_call_all_records
WHERE pns_call_caller_glusr_id = $1 AND pns_call_record_date >= $2 AND pns_call_record_date < $3
ORDER BY pns_call_record_date DESC
LIMIT 50`;

const CONNECTED = new Set(["52", "67", "20"]);

export default defineTool({
  description:
    "Get a buyer's platform activity in a time window: searches (with keywords), product browses, click-to-call, enquiries, " +
    "and optionally PNS phone calls to sellers. Source: bizfeed ImBuyerActivity/GetData (max 30 days per call) and PNS_CALL_ALL_RECORDS. " +
    "Activity is a weak signal: a view is not a requirement. Load the buyer-activity-evidence skill before interpreting it.",
  inputSchema: z.object({
    glusr_id: z.number().int().positive().describe("Buyer GLID from get_current_bl"),
    lookback_days: z.number().int().min(1).max(30).default(3).describe("Days before end_time to include (max 30)"),
    end_time: z.string().datetime().optional().describe("ISO time to end the window, default now; use the BL post/approval time"),
    include_pns_calls: z.boolean().default(true),
    limit: z.number().int().min(1).max(200).default(60),
  }),
  label: { start: ({ glusr_id, lookback_days }) => `Read ${lookback_days}d activity for buyer ${glusr_id}` },
  async execute({ glusr_id, lookback_days, end_time, include_pns_calls, limit }, ctx) {
    const end = end_time ? new Date(end_time) : new Date();
    const start = daysAgo(lookback_days, end);
    return withEnvelope("get_buyer_activity", glusr_id, ["bizfeed", "postGreEnqR:pns_call_all_records"], async ({ partial }) => {
      const params = new URLSearchParams({
        glusrId: String(glusr_id),
        AK: requireEnv("LEADS_AK"),
        MOD_ID: process.env.BIZFEED_MOD_ID ?? "GLADMIN",
        logtime: istCompact(start),
        endlogtime: istCompact(end),
      });
      const body = await httpJson<BizfeedResponse>(`${requireEnv("BIZFEED_URL")}/ImBuyerActivity/GetData?${params}`, {
        method: "GET",
        timeoutMs: 8_000,
        signal: ctx.abortSignal,
      });
      const code = String(body.CODE ?? "");
      if (code === "404") throw new SourceError("DENIED", `bizfeed: ${body.MESSAGE} (the AK is locked to the cluster IP range)`);
      if (code !== "200" && code !== "204") throw new SourceError("ERROR", `bizfeed CODE ${code}: ${body.MESSAGE ?? ""}`);

      const records: Record<string, unknown>[] = (body.DETAILS ?? []).slice(0, limit).map((a) => ({
        kind: "platform",
        activity_type: a.activity_type,
        at: compactToIso(a.datetime as string),
        mcat_id: a.glcat_mcat_id,
        mcat_name: a.glcat_mcat_name,
        keyword: a.keyword || null,
        product_disp_id: a.product_disp_id || null,
        seller_glusr_id: a.seller_glusr_id || null,
        city_pref: a.location_pref_city_names && a.location_pref_city_names !== "-" ? a.location_pref_city_names : null,
      }));

      if (include_pns_calls) {
        try {
          const calls = await query("PG_ENQ_R_URL", PNS_SQL, [glusr_id, start, end]);
          for (const c of calls) {
            records.push({
              kind: "pns_call",
              activity_type: "PNS_CALL",
              at: c.called_at,
              mcat_id: c.mcat_id,
              product_name: c.product_name,
              seller_glusr_id: c.seller_glusr_id,
              connected: CONNECTED.has(String(c.call_status)),
              duration_seconds: c.duration_seconds,
            });
          }
        } catch (err) {
          partial(`PNS calls unavailable: ${(err as Error).message}`);
        }
      }
      return { records, dataAsOf: end.toISOString() };
    });
  },
});
