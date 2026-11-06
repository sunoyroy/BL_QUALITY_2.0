---
description: Summarize buyer history (past BLs) and profile signals as context for intent and plausibility (guide S04). Load after calling get_past_buyer_leads or get_buyer_profile.
---

# Buyer history and profile (S04)

Output a short context note. Include only verified signals that change how the current BL should be read. Do not write a persona story.

## get_past_buyer_leads

- `state`:
  - `APPROVED_LIVE` / `APPROVED_EXPIRED`: earlier leads that passed approval.
  - `DELETED`: removed or rejected; see `delete_reason_code`.
  - `PENDING`: still in the approval queue.
- Useful patterns:
  - The same product or MCAT posted repeatedly shows a genuine recurring need. It also shows the usual quantity scale only if those leads stated one.
  - Many `DELETED` leads, or leads across unrelated categories in a short time, are a quality risk worth mentioning; they are not proof of a bad lead.
  - Titles that read like product listings ("we manufacture...", "available in stock") support a selling-intent flag.
- Never copy a spec or quantity from an old lead into the current one.

## get_buyer_profile

- Contains booleans and non-contact fields only (`has_company_name`, `gst_verified`, `business_type`, `turnover`, `city`, `state`, verification flags, counts, `products_of_interest`).
- Uses:
  - Business type and turnover help judge whether a quantity is plausible (a retail individual ordering 50,000 tonnes is suspicious).
  - A `business_type` of manufacturer or supplier, combined with selling-style text, supports a selling-intent flag.
  - The city/state can be compared with a delivery location stated in chat or a call.
- Missing profile fields mean "unknown", not "unverified buyer".

## Output shape

```
history: 6 leads in 90d (4 approved, 2 deleted); 3 for "SS pipe" MCAT -> recurring need
profile: business_type=Trader, gst_verified=true
relevance: supports product identity; quantity 500 Kg is in line with past leads
```
