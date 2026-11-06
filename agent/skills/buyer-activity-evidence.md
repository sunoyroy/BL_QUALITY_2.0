---
description: How to interpret buyer platform activity (searches, browses, calls, enquiries) and product pages as weak supporting signals. Load after calling get_buyer_activity or get_product_context.
---

# Buyer activity evidence

Activity shows what the buyer looked at, not what they want to buy. Use it only to support or question what the buyer said.

## What the records mean (get_buyer_activity)

- `kind: platform` comes from bizfeed. `activity_type` is the action (search, product view, click-to-call, enquiry, ...). `keyword` is the search text. `mcat_id`/`mcat_name` is the category of the page or product. `product_disp_id` can be passed to `get_product_context`.
- `kind: pns_call` is a phone call the buyer placed to a seller through PNS. `connected: true` means the call went through. `duration_seconds` shows how long it lasted.
- The window ends at `end_time`. Use the BL time so later browsing does not leak in.

## Strength ladder (weakest to strongest)

1. A single view of a product or category.
2. Repeated views or searches for the same product within the window.
3. A search keyword that names the product with a spec (e.g. "ss 304 pipe 2 inch").
4. A connected PNS call, or an enquiry about the same product shortly before the BL.

Even level 4 does not let you add a spec, quantity or unit the buyer never stated. It can:
- support the product identity when the title is vague (e.g. title "pipe" plus searches for "SS 304 pipe" makes "SS 304 Pipe" a candidate, not a fact);
- support an MCAT choice between close candidates;
- raise a selling-intent flag when the buyer mostly visits seller tools or lists their own products.

## get_product_context

- Products are seller listings, not the buyer's words. Use the product name and MCAT to understand which product family the buyer was looking at.
- Never copy a seller's specs or price into the BL.

## Caveats

- `DENIED` from bizfeed usually means the agent is running outside the cluster IP range. Report "could not verify activity"; never report "no activity".
- An empty window is normal for buyers who post directly from a WhatsApp or call flow.
