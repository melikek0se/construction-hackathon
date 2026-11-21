# Voice agent for supplier price inquiries

Status: **built; connected and spoke on 2026-11-22, not yet tried with a person answering**: `src/boq/voice.py`, `web/src/Call.tsx`; see `STATE.md`. The browser call with a client tool is what is built; no phone number, no webhook.
API facts were read from the ElevenLabs docs on 2026-11-20; items marked *unverified* were not confirmed.

## Assessment

**Do it — as the closing act of the demo, not as the product.**

For:

- It attacks the real unknown (`04-field-insights.md` #4): a current price exists only at the supplier.
  Phoning suppliers is what estimators already do; we automate an existing chore.
- It is the one thing in the room nobody else will have, and it is memorable in a three-minute pitch.
- We have ElevenLabs credits, and the platform covers everything needed (German voice, browser calls, tools, webhooks).

Against:

- The brief's priority is **error detection**. A jury of construction people will score a weak risk report with a
  great phone call below a strong risk report without one.
- Live voice demos fail (noise, latency, network).
- Real calls to real suppliers carry legal questions (below) and cannot be shown live anyway.

Therefore:

1. Build it only after upload → findings works end to end.
2. Time-box: about four hours for one person. If it is not working by then, show a recording.
3. On stage, a teammate plays the supplier in the browser. No phone number, no legal exposure, no telephony risk.
4. Frame it honestly: the agent gets an **indicative price and chases quotes**; the binding quote still comes in
   writing. It does not negotiate and does not commit the company to anything.

## Where it sits in the flow

```
price gaps (ranked by money at stake)
   → estimator selects items, picks supplier → "Request quote"
   → call starts with item + company context
   → agent: introduces itself as an AI assistant of <company>, states project and site,
            asks for price / unit / validity / lead time, asks about an equivalent if not available
   → mid-call tool `submit_quote(...)` → backend → UI row updates live
   → price confidence rises, risk buffer for the bid total shrinks (visible on screen)
   → follow-up email draft: "as discussed by phone, please confirm in writing"
```

The visible effect is the point: **the bid's uncertainty band narrows while the call is still running.**

## Conversation design

Per-call variables (from the LV item and the company profile):

`company_name`, `customer_number`, `contact_name`, `callback_number`, `project_name`, `delivery_location`,
`item_description` (short, spoken form), `spec` (DN, material, standard), `order_quantity`, `unit`,
`delivery_window`, `bid_deadline`, `lv_item_id`.

Note `order_quantity` = LV quantity plus waste, rounded — not the LV quantity (`04-field-insights.md` #3).

Script outline (German, short sentences, one question at a time):

1. Disclosure and identity: "Guten Tag, hier ist der digitale Assistent der Firma {{company_name}}. Ich bin eine KI
   und rufe wegen einer Preisanfrage an." Offer a human callback at any time.
2. Context without being asked: company, customer number, project, site location, that it is for a bid.
   (Suppliers always ask who is calling — answer before they do.)
3. The item: product/spec, quantity, delivery window.
4. Collect: net unit price and unit, freight / delivered-to-site, validity of the price, lead time, minimum quantity.
5. If unavailable or no price: ask for an equivalent product and its price; else ask who can quote and by when.
6. Read back the numbers for confirmation. Ask for written confirmation to the company's email.
7. Call `submit_quote`, thank, end.

Guardrails in the prompt: never invent company details, never accept or place an order, never negotiate beyond asking
for the project price, say "I will pass that to my colleague" for anything outside the script, repeat numbers digit by
digit, end the call politely if the other side does not want to talk to an AI.

Hard parts to test early: German numbers and units by voice ("siebenundvierzig Euro achtzig pro Meter"), product
codes and DN values, interruptions, the supplier asking a counter-question the item text cannot answer.

## Technical plan (ElevenLabs Agents)

- **One agent**, created in the dashboard: German system prompt, first message with the AI disclosure, language `de`.
  Low-latency TTS model (API default `eleven_v4_turbo`; the docs disagree with themselves on the non-English default —
  check in the dashboard). German speech recognition is very likely fine but was *unverified* on the page read.
- **Per-call context** through dynamic variables: `{{item_description}}` etc. in prompt and first message.
- **Stage demo in the browser**: `@elevenlabs/react`, `startSession({ agentId })` (public agent) or a conversation
  token from `GET /v1/convai/conversation/token?agent_id=…` (private agent). WebRTC, no phone number.
- **Structured result, two paths**:
  - webhook tool `submit_quote(unit_price, unit, validity_days, lead_time_days, freight_included, equivalent_product,
    notes)` → `POST /tools/submit_quote` on our backend, mid-call → UI updates live;
  - data-collection fields delivered in the `post_call_transcription` webhook as fallback and audit record
    (HMAC-signed, `ElevenLabs-Signature` header).
  - A *client tool* is an alternative for the browser demo: runs in the page, no public URL needed.
- **Backend additions**: `/call/start` (returns token + variables), `/tools/submit_quote`, `/webhooks/elevenlabs`.
  Webhook tools need a **public URL** (deploy or tunnel) — plan for that.
- **Real phone call (stretch)**: `POST /v1/convai/twilio/outbound-call` with `agent_id`, `agent_phone_number_id`,
  `to_number`, `conversation_initiation_client_data.dynamic_variables`. Needs a Twilio account and a number or a
  verified caller ID. A German +49 number requires business documents and its approval time is unknown — **do not
  count on one during the hackathon.** Calling a teammate's mobile from a non-German number is the realistic stretch.
- Useful built-ins: voicemail detection, transfer to a human number, end-call tool.
- **Cost** (verified at <https://elevenlabs.io/pricing/agents>): 0.08 USD per call minute beyond the plan's included
  minutes (Free 15, Starter 75, Creator 275, Pro 1,238), LLM usage billed on top, telephony billed by Twilio.
- **Packages**: Python `elevenlabs`, Node `@elevenlabs/elevenlabs-js`, browser `@elevenlabs/react`.
- **German**: listed in the best accuracy tier for the Scribe speech-to-text model; not explicitly confirmed for the
  realtime model — test with numbers, units and product codes before relying on it.

Docs index: <https://elevenlabs.io/docs/eleven-agents/llms.txt> ·
outbound call: <https://elevenlabs.io/docs/eleven-agents/api-reference/integrations/twilio/outbound-call> ·
React SDK: <https://elevenlabs.io/docs/eleven-agents/libraries/react> ·
webhook tools: <https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools> ·
dynamic variables: <https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables> ·
post-call webhooks: <https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks>

## Legal (Germany / EU) — not legal advice

A judge may ask. Short, defensible answers:

- **AI disclosure.** EU AI Act Art. 50(1) requires telling people they are talking to an AI; it has applied since
  2 August 2026. Our agent says so in its first sentence. <https://artificialintelligenceact.eu/article/50/>
- **Calling businesses (UWG §7).** Purchase inquiries count as "advertising" under German case law, so B2B calls need
  at least presumed consent — plausible for a supplier being asked to quote products it sells, but judged case by
  case. Open point: "automatic calling machines" need *express prior* consent even B2B, and whether a conversational
  agent counts is unsettled. <https://www.gesetze-im-internet.de/uwg_2004/__7.html>
  **Our position: the agent calls only suppliers the company already has a relationship with or who opted in, and
  always offers a human callback.**
- **Recording.** Recording a call without consent is a criminal offence (§201 StGB). Either announce and get consent
  at the start, or switch audio recording off and keep only the structured result.
  <https://www.gesetze-im-internet.de/stgb/__201.html>
- The stage demo with a consenting teammate raises none of these.

## Fallbacks

1. Browser call fails on stage → pre-recorded video of the same call.
2. Voice too slow or unreliable in German → same flow as an **email RFQ**: generated inquiry, pasted supplier reply,
   parsed into the same `submit_quote` structure. This is worth building first anyway: it is the normal channel, it
   shares the data model, and it makes the voice agent a second transport instead of a separate feature.

## Why not another platform

Vapi, Retell, OpenAI Realtime + Twilio and Deepgram all work, but each needs separate telephony or more plumbing and
none has an advantage for a German demo. We have ElevenLabs credits and it covers voice, browser calls, tools and
post-call data on one platform.
