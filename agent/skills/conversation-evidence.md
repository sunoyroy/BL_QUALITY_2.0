---
description: How to read WhatsApp chats and Vaani/AI-bot call extractions as buyer evidence. Load after calling get_whatsapp_history or get_vaani_evidence.
---

# Conversation evidence (WhatsApp, Vaani)

These are the strongest sources after the BL itself, because the buyer is speaking directly.

## get_whatsapp_history

- `LEAP_WHATSAPP_LOG` records are the LEAP WhatsApp flow for this lead, in time order. `attribute` says what the step was (for example a question asked or an answer given). `disposition` is the outcome the flow recorded.
- `WHATSAPP_9696_BUYER_MESSAGE` records are free text the buyer typed on the 9696 number. Only rows with `for_this_bl: true` are about this BL. Other rows are context, not evidence for this requirement.
- When the buyer corrects themselves later in the chat, the later message wins.
- A bot question the buyer never answered is not evidence.

## get_vaani_evidence

- Without `extract`, you only learn whether a recording exists (`recording_ref`, `source`). That alone proves nothing about content.
- With `extract: true`, `extraction` holds fields a model pulled from the call audio: `title`, `isq specification`, `quantity`, `quantity unit`, `additional details`, delivery `city`/`state`, and so on.
  - This is model output, not a human transcript. It can mishear numbers and units.
  - Use it to confirm or question BL values. To change a value based on the call alone, the extracted value must be specific and must not contradict other buyer text; otherwise mark it `BUYER_CLARIFICATION`.
  - `extraction: { skipped: true }` means the extractor decided the call had nothing usable.

## Precedence when sources disagree

1. The buyer's own latest words: a later WhatsApp message, or a Vaani extraction from after the BL was posted.
2. The buyer's original BL text and buyer-filled details.
3. Earlier chat messages.
4. Everything else (activity, history, catalog): context only.

Always cite which record you used (source plus time or `recording_ref`). Never quote masked contact data.
