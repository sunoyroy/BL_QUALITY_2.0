import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireEnv } from "../lib/config";
import { SourceError, withEnvelope } from "../lib/envelope";
import { httpJson } from "../lib/http";

// RC4 over "glid#glid#1", base64, '+' escaped: the K parameter the buyerprofile service expects
// (createakey in leadApprovalPostgresFunc.go).
function profileKey(glid: number, secret: string): string {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + secret.charCodeAt(i % secret.length)) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const text = `${glid}#${glid}#1`;
  const out = Buffer.alloc(text.length);
  let i = 0;
  j = 0;
  for (let y = 0; y < text.length; y++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    out[y] = text.charCodeAt(y) ^ s[(s[i] + s[j]) % 256];
  }
  return out.toString("base64").replaceAll("+", "%2B");
}

export default defineTool({
  description:
    "Get the buyer's verified business profile: has company name / GST verified / business address, city and state, business type, " +
    "past requirement and enquiry counts, and products of interest. Source: users.imutils.com buyerprofile. " +
    "Contact details (name, phone, email, street address) are never returned. Profile is supporting context only and never overrides the BL.",
  inputSchema: z.object({ glusr_id: z.number().int().positive() }),
  label: { start: ({ glusr_id }) => `Fetch profile for buyer ${glusr_id}` },
  async execute({ glusr_id }, ctx) {
    return withEnvelope("get_buyer_profile", glusr_id, ["users.imutils.com/buyerprofile"], async () => {
      const body = await httpJson<{ Response?: { Code?: number | string; Message?: string; Data?: Record<string, unknown> } }>(
        requireEnv("BUYER_PROFILE_URL"),
        {
          form: {
            token: requireEnv("BUYER_PROFILE_TOKEN"),
            AK: requireEnv("LEADS_AK"),
            supplier_glusrid: String(glusr_id),
            modid: "LEAP",
            K: profileKey(glusr_id, requireEnv("BUYER_PROFILE_K_SECRET")),
          },
          timeoutMs: 8_000,
          signal: ctx.abortSignal,
        },
      );
      const res = body.Response;
      if (!res || Number(res.Code) !== 200 || !res.Data) {
        throw new SourceError(Number(res?.Code) === 204 ? "NOT_FOUND" : "ERROR", `buyerprofile: ${res?.Message ?? "no Response"}`);
      }
      const d = res.Data;
      const interests = Array.isArray(d.products_of_interest)
        ? (d.products_of_interest as Record<string, unknown>[]).map((p) => p.glcat_mcat_name).filter(Boolean)
        : [];
      return {
        records: [
          {
            glusr_id,
            has_company_name: Boolean(d.contacts_company),
            gst_verified: Number(d.is_gst_verified) === 1,
            has_business_address: Boolean(d.contacts_address),
            city: d.contact_city || null,
            state: d.contact_state || null,
            business_type: d.business_type || null,
            turnover: d.turn_over || null,
            mobile_verified: d.verification_status ?? null,
            email_verified: d.is_email_verified ?? null,
            past_requirement_count: d.buyer_past_requirement_count ?? d.total_requirement ?? null,
            enquiry_count: d.enq_count ?? null,
            pns_call_count: d.pns_call_cnt ?? null,
            products_of_interest: interests.slice(0, 20),
          },
        ],
      };
    });
  },
});
