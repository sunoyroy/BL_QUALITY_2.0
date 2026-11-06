import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireEnv } from "../lib/config";
import { withEnvelope } from "../lib/envelope";
import { httpJson } from "../lib/http";

interface LiveMcat {
  id?: number | string;
  name?: string;
  catid?: number | string;
  mcat_accuracy_level?: string;
  isgeneric?: number | string;
  frequency?: number | string;
}

export default defineTool({
  description:
    "Search the IndiaMART MCAT taxonomy for a requirement text (usually the BL title, optionally with key specs). Returns ranked " +
    "candidate MCATs with accuracy level and generic flag, from the same Solr related_info service LEAP uses for BL MCAT mapping. " +
    "With mcat_id set, also returns that MCAT's parent, child and category nodes (MasterDetail) so you can judge specificity.",
  inputSchema: z.object({
    text: z.string().min(2).max(300).describe("Requirement text to classify"),
    bl_id: z.number().int().positive().optional(),
    mcat_id: z.number().int().positive().optional().describe("Current MCAT to fetch hierarchy for"),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  label: { start: ({ text }) => `Search MCATs for "${text.slice(0, 40)}"` },
  async execute({ text, bl_id, mcat_id, limit }, ctx) {
    return withEnvelope("search_mcat_taxonomy", mcat_id ?? text, ["solr:related_info", "MasterDetail"], async ({ partial }) => {
      const params = new URLSearchParams({
        source: "gladmin.buylead.mcat.mapping",
        lead_type: "DIRECT",
        q: text,
        "output.show": "brand_flag,brand_name",
      });
      if (bl_id) params.set("displayid", String(bl_id));
      const base = requireEnv("MCAT_SEARCH_URL");
      const body = await httpJson<{ guess?: { live_mcats?: LiveMcat[] } }>(
        `${base}${base.includes("?") ? "&" : "?"}${params}`,
        { method: "GET", timeoutMs: 7_000, signal: ctx.abortSignal },
      );

      const records: Record<string, unknown>[] = (body.guess?.live_mcats ?? []).slice(0, limit).map((m, rank) => ({
        kind: "candidate",
        rank: rank + 1,
        mcat_id: Number(m.id),
        mcat_name: m.name,
        cat_id: Number(m.catid) || null,
        accuracy: m.mcat_accuracy_level ?? null,
        is_generic: String(m.isgeneric) === "1",
        frequency: m.frequency ?? null,
      }));

      if (mcat_id) {
        try {
          const detail = await httpJson<{ Response?: { Code?: number; Data?: Record<string, unknown> } }>(
            `${requireEnv("MCAT_DETAIL_URL")}${mcat_id}/`,
            { timeoutMs: 7_000, signal: ctx.abortSignal },
          );
          const d = detail.Response?.Data;
          if (d) {
            const names = (list: unknown) =>
              Array.isArray(list) ? (list as Record<string, unknown>[]).map((x) => ({ id: x.glcat_mcat_id ?? x.glcat_cat_id, name: x.glcat_mcat_name ?? x.glcat_cat_name })) : [];
            records.push({
              kind: "current_mcat_hierarchy",
              mcat_id,
              is_generic: String(d.glcat_mcat_is_generic) === "1",
              parents: names(d.parent_data),
              children: names(d.child_data).slice(0, 30),
              categories: names(d.cat_data),
            });
          }
        } catch (err) {
          partial(`MCAT hierarchy unavailable: ${(err as Error).message}`);
        }
      }
      return { records };
    });
  },
});
