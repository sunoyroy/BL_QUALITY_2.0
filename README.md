# BL Quality 2.0 — Agentic Buyer Lead Audit

Design work for replacing the current BL Quality Agent (a set of independent checks) with an evidence-led audit agent. The agent works out what the buyer actually wants, checks every part of the Buyer Lead (BL) against that, fixes only what evidence supports, re-checks the result, and then approves the lead or sends it to manual review.

This folder holds the design documents and the first eve agent (Phase 1: read-only audit).

## Files

| File | What it is |
|---|---|
| `agent/agent.ts` | eve agent config: model via the LEAP LLM gateway, eve's default shell/file/web tools turned off, token limits. |
| `agent/instructions.md` | The agent's always-on rules (from guide section 2), audit steps and report format. |
| `agent/tools/run_existing_quality_checks.ts` | Calls the existing `POST /bl_quality` service and returns each check's result with its issue flag ID, redacting phone/email/GSTIN. Read-only. |
| `.env.example` | Environment variables to copy into `.env.local`. |
| `package.json` | eve 1.0.0-rc.6, `ai`, `zod`, `@ai-sdk/openai-compatible`; Node 24+. |
| `LEAP_Agentic_BL_Quality_Audit_Implementation_Guide.md` | The main guide (v1.1). Architecture, tools, skills, correction policy, approval gates, data model, testing, rollout and open decisions. Its current-state sections were checked against the code. |
| `LEAP_Agentic_BL_Quality_Audit_Implementation_Guide.pdf` | PDF export of **v1.0**. It predates the code-verified corrections, so use the `.md` until the PDF is regenerated. |

## Run the agent

Requires Node.js 24+.

```bash
cd BL_QUALITY_2.0
npm install
cp .env.example .env.local   # then fill in LLM_API_KEY and BL_QUALITY_API_URL
npx eve info                 # checks the agent compiles; should show 0 errors
npx eve dev                  # opens the terminal chat UI
```

In the chat, paste a BL (title, description, MCAT, ISQs, quantity) and ask for an audit. The agent runs the existing checks, adds its own findings and returns a report ending in `READY_FOR_EXISTING_APPROVAL`, `MANUAL_REVIEW` or `BUYER_CLARIFICATION`. It cannot change, approve or reject a lead.

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
