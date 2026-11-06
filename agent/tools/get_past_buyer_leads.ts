import { defineTool } from "eve/tools";
import { z } from "zod";
import { query } from "../lib/db";
import { withEnvelope } from "../lib/envelope";
import { redact } from "../lib/redact";

// Same tables as threeCallAttemptCheck (LeapRModelWorker LRM8/LRM9) and FetchPendingBlData, returning rows instead of counts.
const SQL = `
SELECT * FROM (
  SELECT 'APPROVED_LIVE' AS state, eto_ofr_display_id AS bl_id, eto_ofr_title AS title, fk_glcat_mcat_id AS mcat_id,
         eto_ofr_postdate_orig AS posted_at, NULL::text AS delete_reason_code
  FROM eto_ofr WHERE fk_glusr_usr_id = $1 AND eto_ofr_postdate_orig >= NOW() - ($2 || ' days')::interval
  UNION ALL
  SELECT 'APPROVED_EXPIRED', eto_ofr_display_id, eto_ofr_title, fk_glcat_mcat_id, eto_ofr_postdate_orig, NULL
  FROM eto_ofr_expired WHERE fk_glusr_usr_id = $1 AND eto_ofr_postdate_orig >= NOW() - ($2 || ' days')::interval
  UNION ALL
  SELECT 'DELETED', eto_ofr_display_id, eto_ofr_title, fk_glcat_mcat_id, eto_ofr_postdate_orig,
         fk_eto_ofr_del_reason_code::text
  FROM eto_ofr_temp_del WHERE fk_glusr_usr_id = $1 AND eto_ofr_postdate_orig >= NOW() - ($2 || ' days')::interval
  UNION ALL
  SELECT 'PENDING', eto_ofr_display_id, subject, dir_query_mcatid, date_r, NULL
  FROM dir_query_free WHERE fk_glusr_usr_id = $1 AND date_r >= NOW() - ($2 || ' days')::interval
) t
LEFT JOIN glcat_mcat m ON m.glcat_mcat_id = t.mcat_id
WHERE t.bl_id <> $3
ORDER BY t.posted_at DESC
LIMIT $4`;

export default defineTool({
  description:
    "List the buyer's other Buyer Leads in a lookback window (live, expired, deleted/rejected and pending), with title, MCAT and date. " +
    "Source: ETO_OFR, ETO_OFR_EXPIRED, ETO_OFR_TEMP_DEL, DIR_QUERY_FREE. Use for repeat-requirement patterns only; " +
    "a past lead is never proof of the current requirement.",
  inputSchema: z.object({
    glusr_id: z.number().int().positive(),
    exclude_bl_id: z.number().int().positive().describe("The BL being audited"),
    lookback_days: z.number().int().min(1).max(180).default(90),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  label: { start: ({ glusr_id, lookback_days }) => `List ${lookback_days}d past leads for buyer ${glusr_id}` },
  async execute({ glusr_id, exclude_bl_id, lookback_days, limit }) {
    return withEnvelope("get_past_buyer_leads", glusr_id, ["imbuyrecR"], async () => {
      const rows = await query("PG_IMBUYREC_R_URL", SQL, [glusr_id, String(lookback_days), exclude_bl_id, limit]);
      return {
        records: rows.map((r) =>
          redact({
            bl_id: Number(r.bl_id),
            state: r.state,
            title: r.title,
            mcat_id: Number(r.mcat_id) || null,
            mcat_name: r.glcat_mcat_name ?? null,
            posted_at: r.posted_at,
            delete_reason_code: r.delete_reason_code ?? null,
          }),
        ),
      };
    });
  },
});
