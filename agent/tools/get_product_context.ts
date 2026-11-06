import { defineTool } from "eve/tools";
import { z } from "zod";
import { optionalEnv, requireEnv } from "../lib/config";
import { SourceError, withEnvelope } from "../lib/envelope";
import { httpJson } from "../lib/http";

type Product = Record<string, unknown>;

export default defineTool({
  description:
    "Get catalog details for products the buyer viewed or contacted (product_disp_id values from get_buyer_activity): name, price, " +
    "prime MCAT, and optionally the seller's specifications. Source: users.imutils.com products/detail. " +
    "This describes what sellers offer, not what the buyer asked for.",
  inputSchema: z.object({
    product_disp_ids: z.array(z.number().int().positive()).min(1).max(15),
    include_specs: z.boolean().default(false).describe("Also fetch seller specs per product (one extra call each, max 5)"),
  }),
  label: { start: ({ product_disp_ids }) => `Fetch ${product_disp_ids.length} product(s)` },
  async execute({ product_disp_ids, include_specs }, ctx) {
    return withEnvelope("get_product_context", product_disp_ids.join(","), ["users.imutils.com/products/detail"], async ({ partial }) => {
      const base = requireEnv("PRODUCT_DETAIL_URL");
      const body = await httpJson<Product[] | Record<string, unknown>>(`${base}${product_disp_ids.join(",")}/flag/3/`, {
        timeoutMs: 6_000,
        signal: ctx.abortSignal,
      });
      if (!Array.isArray(body)) throw new SourceError("SCHEMA_ERROR", "products/detail did not return an array");

      const records = body.map((p) => ({
        product_disp_id: Number(p.PC_ITEM_DISPLAY_ID),
        name: p.PC_ITEM_DISPLAY_NAME ?? p.PC_ITEM_NAME,
        price: Number(p.GLCAT_MCAT_NO_PRICE) === 1 ? null : (p.PRODUCT_PRICE ?? null),
        prime_mcat_id: p.PC_ITEM_PRIME_MCAT ?? null,
        parent_mcat_id: p.PC_ITEM_PRIME_PARENT_MCAT_ID ?? null,
        seller_glusr_id: p.PC_ITEM_GLUSR_USR_ID ?? null,
        specs: undefined as { question: string; answer: string }[] | undefined,
      }));

      const specBase = optionalEnv("PRODUCT_SPEC_URL_TEMPLATE");
      if (include_specs && !specBase) partial("PRODUCT_SPEC_URL_TEMPLATE is not set; product specs skipped.");
      if (include_specs && specBase) {
        for (const r of records.slice(0, 5)) {
          try {
            const detail = await httpJson<Product[]>(specBase.replace("{id}", String(r.product_disp_id)), {
              timeoutMs: 4_000,
              signal: ctx.abortSignal,
            });
            const isq = (detail?.[0]?.ISQ as Product[] | undefined) ?? [];
            r.specs = isq.map((s) => ({
              question: String(s.FK_IM_SPEC_MASTER_DESC ?? ""),
              answer: String(s.SUPPLIER_RESPONSE_DETAIL ?? ""),
            }));
          } catch (err) {
            partial(`Specs for product ${r.product_disp_id} unavailable: ${(err as Error).message}`);
          }
        }
      }
      return { records };
    });
  },
});
