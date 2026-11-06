---
description: Use MCAT taxonomy search, ISQ spec definitions and MCAT price/quantity statistics to check category, specs and quantity/unit (inputs for guide S08, S09, S10). Load after calling search_mcat_taxonomy, get_attribute_definitions or get_mcat_quantity_stats.
---

# MCAT, specs and quantity reference data

These tools describe the catalog, not the buyer. Use them to check whether the BL's values are valid and plausible, never to invent values.

## search_mcat_taxonomy (category)

- `candidate` records are ranked by the same Solr service LEAP uses to map BLs to MCATs. `accuracy` is that service's confidence label, and `is_generic` marks broad catch-all MCATs.
- `current_mcat_hierarchy` gives the BL's current MCAT with its parents, children and categories.
- Mismatch flag: the current MCAT is not among the candidates, AND the top candidate clearly fits the title and specs better.
- Too generic: the current MCAT `is_generic` is true, AND one child clearly matches the buyer's words.
- If the top 2-3 candidates are close and the buyer text cannot separate them, report `MCAT_AMBIGUOUS` and do not propose a change.

## get_attribute_definitions (specs)

- Each record is a spec question for the MCAT: `question`, `type`, allowed `options`, `priority` (lower means more important).
- Check that every BL spec answers a real question for this MCAT, and that option-type answers match an allowed option (allow case and spelling variants).
- The question "Quantity Unit" lists the allowed units. A BL unit outside that list is a `UNIT_INVALID` candidate.
- Missing high-priority specs: report them as open questions for the buyer. Never fill them yourself.

## get_mcat_quantity_stats (quantity and price)

- `quantity` is the distribution of past BL quantities for this MCAT and unit: `p50` is typical, `p95`/`p99` are the high end. `bl_count` is how many BLs that is based on; under about 30, treat it as weak.
- `price` holds Q1/median/Q3 prices for the unit over the last 3 months.
- How the current check works (flag 3): a quantity above 1,000 that is also above p95 is flagged. Use the same idea, but explain it in words, for example "500,000 Piece is 40x the p95 (12,500) for this MCAT".
- An outlier is a reason to ask the buyer, not a reason to change the number. Watch for unit confusion (grams vs kg, pieces vs boxes), and say so when it is the likely cause.
- A `PARTIAL` result with "no price bucket" or "no quantity distribution" means the unit is rare for this MCAT. That is itself worth a note.
