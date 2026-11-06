# BL Quality 2.0 — Agentic Buyer Lead Audit

Design work for replacing the current BL Quality Agent (a set of independent checks) with an evidence-led audit agent. The agent works out what the buyer actually wants, checks every part of the Buyer Lead (BL) against that, fixes only what evidence supports, re-checks the result, and then approves the lead or sends it to manual review.

This folder holds the design documents and the first eve agent (Phase 1: read-only audit).

## Files

| File | What it is |
|---|---|
| `agent/agent.ts` | eve agent config: model via the LEAP LLM gateway, eve's default shell/file/web tools turned off, token limits. |
| `agent/instructions.md` | The agent's always-on rules (from guide section 2), audit steps and report format. |
| `agent/tools/` | 12 read-only data tools, one per data source (table below). |
| `agent/skills/` | 6 skills that tell the model how to collect and read that data (table below). |
| `agent/lib/` | Shared helpers: the common result envelope, HTTP/Postgres/Redis clients (Postgres sessions forced read-only), PII masking, IST time formats, the getisq parser. |
| `.env.example` | Every URL, key and database connection the tools need, with placeholders. Copy to `.env.local`. |
| `tsconfig.json` | Strict TypeScript settings for `npm run typecheck`. |
| `package.json` | eve 1.0.0-rc.6, `ai`, `zod`, `@ai-sdk/openai-compatible`; Node 24+. |
| `LEAP_Agentic_BL_Quality_Audit_Implementation_Guide.md` | The main guide (v1.1). Architecture, tools, skills, correction policy, approval gates, data model, testing, rollout and open decisions. Its current-state sections were checked against the code. |
| `LEAP_Agentic_BL_Quality_Audit_Implementation_Guide.pdf` | PDF export of **v1.0**. It predates the code-verified corrections, so use the `.md` until the PDF is regenerated. |

## Data tools

Each tool wraps an API, table or cache that LEAP already uses (mostly lifted from the Go workers), and returns the same envelope: `status` (`SUCCESS`, `PARTIAL`, `NOT_FOUND`, `DENIED`, `TIMEOUT`, `NOT_CONFIGURED`, ...), `records`, `warnings`, `source_systems`. SQL is fixed in code; the model only supplies IDs.

| Tool | What it returns | Source |
|---|---|---|
| `get_current_bl` | The BL: title, description, MCAT, status, quantity/unit, buyer-filled details, ISQ answers | `ETO_OFR` / `_EXPIRED` / `_TEMP_DEL`, `DIR_QUERY_FREE`, getisq |
| `run_existing_quality_checks` | Results of the current checks (flags 1–7) | `POST /bl_quality` |
| `get_existing_quality_audit` | Changes the current agent already made to this BL | `leap_blml_agent_audit_log` (postgreML) |
| `get_whatsapp_history` | LEAP WhatsApp log for the lead and the buyer's 9696 messages | `ETO_LEAD_WHATSAPP*`, waapi `get_extractor_llm_calling` |
| `get_vaani_evidence` | Whether a call recording exists; optionally what the buyer said (extracted) | `DIR_QUERY_FREE`, `ETO_LEAP_AI_BOT_RESPONSE`, Redis `VANI_MCAT_MANUAL`, `call_data_extractor` |
| `get_buyer_activity` | Searches, browses, enquiries and PNS calls in a time window | bizfeed `ImBuyerActivity`, `PNS_CALL_ALL_RECORDS` |
| `get_product_context` | Name, price, MCAT (and optionally specs) of products the buyer viewed | products/detail service |
| `get_past_buyer_leads` | The buyer's other leads (live, expired, deleted, pending) | `ETO_OFR*`, `DIR_QUERY_FREE` |
| `get_buyer_profile` | Non-contact profile flags (GST verified, business type, turnover, city) | buyerprofile service |
| `search_mcat_taxonomy` | Ranked candidate MCATs for a text, plus the current MCAT's parents/children | Solr `related_info`, MasterDetail |
| `get_attribute_definitions` | Spec questions, allowed options and units for an MCAT | getisq (MCAT mode) |
| `get_mcat_quantity_stats` | Typical price (Q1/median/Q3) and BL quantity percentiles for an MCAT + unit | `mcatunittov`, Redis `MCAT_QTY_STATS` |

## Skills

| Skill | When the model loads it |
|---|---|
| `evidence-aggregation` | Start of every audit: which tools to call, in what order, how to read each status, coverage matrix (guide S02). |
| `conversation-evidence` | Reading WhatsApp and Vaani evidence; what wins when they disagree. |
| `buyer-activity-evidence` | Reading activity and product pages as weak signals. |
| `buyer-history-and-profile` | Summarizing past leads and profile as context (guide S04). |
| `mcat-and-attributes` | Checking MCAT fit, spec validity and quantity/unit plausibility. |
| `requirement-synthesis` | Building the buyer's requirement with per-field source and confidence (guide S03). |

## Run the agent

Requires Node.js 24+.

```bash
cd BL_QUALITY_2.0
npm install
cp .env.example .env.local   # then fill in what you have access to
npx eve info                 # checks the agent compiles; should show 0 errors
npm run typecheck            # strict TypeScript check
npx eve dev                  # opens the terminal chat UI
```

In the chat, ask "audit BL 123456789". The agent loads the BL, gathers evidence, and returns a report ending in `READY_FOR_EXISTING_APPROVAL`, `MANUAL_REVIEW`, `BUYER_CLARIFICATION` or `TECHNICAL_RETRY`. It cannot change, approve or reject a lead. You can also paste BL text with no ID; then only the existing checks run.

Most sources only answer from inside the LEAP cluster IP range or VPN. Any tool whose variables are blank returns `NOT_CONFIGURED`, and the agent reports that source as "could not verify" rather than "nothing found".

## Where to start

- **New to the project:** read guide sections 1 (summary and current state) and 2 (rules the agent must follow).
- **Working on the existing agent:** read section 1.3 (how it runs today), section 3.1 (check registry with flag IDs) and section 11.2 (audit table).
- **Building the new system:** read sections 4 (architecture), 5 (tools), 7–8 (skills and their order) and 10 (approval gates).
- **Planning:** read sections 18 (phases), 21 (open decisions) and 22 (first backlog).

## Current system at a glance

The existing agent is the LangGraph service `POST /bl_quality` in `leap-python/leapAi/leap-genai-api/api/bl_quality/`. During auto-approval, `leap-go-workers/.../LeapAutoApprovalWorker/leadApprovalPostgresFunc.go` calls it, applies the results and logs each change to `leap_blml_agent_audit_log`.

| Flag ID | Check | Decided by |
|---|---|---|
| 1 | Spec–title mismatch | LLM |
| 2 | One-word title | LLM |
| 3 | Absurd quantity | Rules only |
| 4 | PII removal | Regex gate, then LLM |
| 5 | Selling intent | Keyword gate, then LLM |
| 6 | Description correction (including "Buyer searched for…" text) | LLM |
| 7 | Buyer Filled Details validity | LLM |
| 8 | Add WhatsApp chat as Buyer Filled Details (never written to the audit log) | LLM |

See guide section 1.3 for known gaps in the current system: failures are treated as "no issue", checks can't see each other's output, and the PII pre-filter misses addresses and company names.

## Status

This is a draft for review by engineering, product, data, DBA and operations. The next step is Phase 0 (guide section 18): confirm which Redis feature flags are on in production, confirm the Eve runtime, and sign off the check registry and policy matrix.
