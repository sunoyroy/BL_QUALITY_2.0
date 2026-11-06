import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireEnv } from "../lib/config";
import { query } from "../lib/db";
import { withEnvelope } from "../lib/envelope";
import { httpJson } from "../lib/http";
import { redact } from "../lib/redact";
import { redis } from "../lib/redis";

// No transcript store exists; recordings are referenced from these places.
const RECORDING_SQL = `
SELECT 'DIR_QUERY_FREE' AS source, eto_ofr_call_recording_url AS url FROM dir_query_free
  WHERE eto_ofr_display_id = $1 AND eto_ofr_call_recording_url IS NOT NULL AND eto_ofr_call_recording_url <> ''
UNION ALL
SELECT 'ETO_OFR_TEMP_DEL', eto_ofr_call_recording_url FROM eto_ofr_temp_del
  WHERE eto_ofr_display_id = $1 AND eto_ofr_call_recording_url IS NOT NULL AND eto_ofr_call_recording_url <> ''
UNION ALL
SELECT 'ETO_LEAP_AI_BOT_RESPONSE', call_recording_url FROM eto_leap_ai_bot_response
  WHERE fk_eto_ofr_display_id = $1 AND fk_glusr_usr_id = $2 AND call_recording_url IS NOT NULL AND call_recording_url <> ''`;

// Fields from call_data_extractor that identify the buyer are dropped before the model sees them.
const IDENTITY_FIELDS = new Set(["buyer name", "company name", "buyer phone number", "pincode"]);

export default defineTool({
  description:
    "Find Vaani / AI-bot call recordings for a BL and, if extract=true, run the existing call_data_extractor service " +
    "(LLM transcription + extraction, up to 90 s) to get what the buyer said on the call: title, specifications, quantity, unit, " +
    "additional details, delivery city/state. Recording URLs themselves are never returned. " +
    "Extracted values are model output from audio, so treat them as strong-but-unverified evidence.",
  inputSchema: z.object({
    bl_id: z.number().int().positive(),
    glusr_id: z.number().int().positive(),
    extract: z.boolean().default(false).describe("Run call_data_extractor on the first recording found"),
  }),
  label: { start: ({ bl_id, extract }) => (extract ? `Extract call evidence for BL ${bl_id}` : `Find call recordings for BL ${bl_id}`) },
  async execute({ bl_id, glusr_id, extract }, ctx) {
    return withEnvelope(
      "get_vaani_evidence",
      bl_id,
      ["imbuyrecR", "redis:VANI_MCAT_MANUAL", "call_data_extractor"],
      async ({ partial, warn }) => {
        const recordings: { source: string; url: string }[] = [];

        try {
          const rows = await query("PG_IMBUYREC_R_URL", RECORDING_SQL, [bl_id, glusr_id]);
          rows.forEach((r) => recordings.push({ source: String(r.source), url: String(r.url) }));
        } catch (err) {
          partial(`Recording lookup in DB failed: ${(err as Error).message}`);
        }
        try {
          const url = await (await redis()).get(`VANI_MCAT_MANUAL:${bl_id}`);
          if (url) recordings.push({ source: "REDIS_VANI_MCAT_MANUAL", url });
        } catch (err) {
          warn(`Redis recording key unavailable: ${(err as Error).message}`);
        }

        const records: Record<string, unknown>[] = recordings.map((r, i) => ({
          recording_ref: `${r.source}#${i}`,
          source: r.source,
        }));
        if (!extract || recordings.length === 0) return { records };

        try {
          const body = await httpJson<{ output?: Record<string, unknown> }>(requireEnv("CALL_DATA_EXTRACTOR_URL"), {
            json: { call_rec: recordings[0].url, glusrId: String(glusr_id) },
            timeoutMs: 90_000,
            signal: ctx.abortSignal,
          });
          const out = body.output ?? {};
          if (out.extraction_skipped) {
            records[0].extraction = { skipped: true };
          } else {
            records[0].extraction = redact(
              Object.fromEntries(Object.entries(out).filter(([k]) => !IDENTITY_FIELDS.has(k) && k !== "extraction_skipped")),
            );
          }
        } catch (err) {
          partial(`call_data_extractor failed: ${(err as Error).message}`);
        }
        return { records };
      },
    );
  },
});
