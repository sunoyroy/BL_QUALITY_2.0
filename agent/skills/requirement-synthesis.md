---
description: Turn the evidence bundle into one structured buyer requirement with per-field sources, confidence and open questions (guide S03). Load after evidence aggregation, before writing findings.
---

# Buyer requirement synthesis (S03)

Build the requirement the buyer actually expressed, then compare the current BL to it.

## Fields

`product`, `specs` (name to value), `quantity`, `unit`, `usage`, `delivery_location`, `intent` (BUYING, SELLING, SERVICE_OR_JOB, AMBIGUOUS).

For each field record: `value`, `source` (which tool and record), `confidence` (HIGH, MEDIUM or LOW), and any `conflict`.

## Source precedence (highest first)

1. The buyer's latest direct words: a WhatsApp message after posting, or a Vaani extraction.
2. The BL as the buyer submitted it: title, description, buyer-filled details, ISQ answers.
3. Earlier chat turns.
4. Supporting context: activity, past leads, profile, catalog. These can raise or lower confidence, but they never supply a value on their own.

## Confidence

- HIGH: stated by the buyer and not contradicted.
- MEDIUM: stated once, or stated by the buyer but slightly unclear (e.g. a unit implied by context).
- LOW: only inferred from supporting context, or contradicted. A LOW field must not drive a correction; it becomes an open question.

## Freshness

- Prefer evidence closest to, or after, the BL time. Activity after the BL time is excluded.
- If the current BL fields were changed by the existing quality agent (see `get_existing_quality_audit`), compare its before and after values against the buyer evidence. The agent's output is not buyer evidence.

## Output

```
requirement:
  product: "SS 304 Seamless Pipe"   | BL title + WhatsApp 10:14 | HIGH
  specs: {grade: "304", size: "2 inch"} | ISQ answers           | HIGH
  quantity: 500                     | BL                        | HIGH
  unit: "Kg"                        | BL; call said "kilo"      | HIGH
  intent: BUYING                    | BL text; no selling signs | HIGH
open_questions:
  - Schedule/thickness not stated (high-priority spec for this MCAT)
conflicts: none
```

Then compare each BL field with this requirement. That comparison is what the findings in the report are based on.
