# Architecture (proposal)

Status: **proposed, not yet agreed by the team** — see `DECISIONS.md` D-003 and `OPEN_QUESTIONS.md`.
Nothing of this is built yet.

## Shape

```
 upload (X83 / D83 / D84 / D86 / PDF)
        │
        ▼
 ┌─────────────┐   one normalised model, whatever the source
 │   parsers   │──────────────────────────────┐
 └─────────────┘                              ▼
                                       ┌─────────────┐
 ┌─────────────┐   findings            │  BoQ model  │
 │ rule checks │◀──────────────────────│ (item tree) │
 ├─────────────┤                       └─────────────┘
 │ LLM checks  │◀── items + preliminary remarks, per title
 └──────┬──────┘
        ▼
 ┌─────────────┐   ┌──────────────────┐   ┌───────────────────┐
 │ risk score  │   │ price resolution │◀──│ price sources      │
 │ + CO class  │   │ (waterfall)      │   │ history · quotes · │
 └──────┬──────┘   └────────┬─────────┘   │ model estimate     │
        │                   │             └─────────▲─────────┘
        ▼                   ▼                       │ structured quote
 ┌──────────────────────────────────┐      ┌────────┴─────────┐
 │ web app: items · findings ·      │─────▶│ RFQ: email draft │
 │ prices · what-if · exports       │      │ or voice agent   │
 └──────────────────────────────────┘      └──────────────────┘
```

## Suggested stack

- **Backend: Python + FastAPI**, managed with `uv` (the system Python is 3.9 — let `uv` pin 3.12).
  `lxml` or stdlib `ElementTree` for GAEB XML, a small hand-written fixed-width reader for GAEB 90,
  `pdfplumber` or `pymupdf` for PDF text with layout, `pydantic` for the model.
- **LLM: Claude API.** A fast model for per-item bulk checks, the strongest model for title-level reasoning
  (missing items, contradictions with preliminary remarks). Structured (JSON-schema) output for findings; prompt caching for
  the shared system prompt and preliminary remarks; run titles in parallel.
- **Frontend: React (Vite or Next.js)** with a table component that survives 2,000 rows.
- **Storage: SQLite or plain JSON files.** No auth, no multi-tenancy.
- **Voice: ElevenLabs Agents** — see `05-voice-agent.md`.

## Data model (sketch)

```python
class Item:
    oz: str                  # normalised item number, e.g. "02.01.0240"
    path: list[str]          # titles from root to item
    short_text: str
    long_text: str
    qty: Decimal | None
    unit_raw: str            # as in the file
    unit: str                # normalised: m, m2, m3, St, psch, h, t, kg, Wo, ...
    kind: Literal["normal", "lump_sum", "contingency", "alternative", "hourly", "surcharge"]
    refs: list[str]          # "wie Position ..." references to other items
    up: Decimal | None       # unit price if the source is a bid
    total: Decimal | None
    source: SourceRef        # file, page / line, for click-through

class Finding:
    item_oz: str | None      # None = whole-LV finding
    category: Literal["error", "unclear_scope", "quantity", "change_order", "contract_risk", "price"]
    check_id: str            # e.g. "R-UNIT-MISMATCH", "L-MISSING-ITEM"
    severity: Literal["info", "warn", "high"]
    evidence: str            # quoted text that triggered it
    explanation: str         # why it matters to an estimator
    action: Literal["ask_client", "add_surcharge", "get_quote", "note_for_claims", "fix_typo"]
    money_at_stake: Decimal | None
    origin: Literal["rule", "llm"]

class PricePoint:
    item_oz: str
    unit_price: Decimal
    source: Literal["history", "benchmark", "supplier_quote", "model_estimate"]
    source_detail: str       # project / supplier / call id
    as_of: date
    valid_until: date | None
    confidence: float        # 0..1, decays with age
    low: Decimal             # band used by the what-if / risk buffer
    high: Decimal
```

The `PricePoint` shape is the direct answer to "no price is 100 % reliable or current" (`04-field-insights.md`):
a price never appears in the UI without source, date and band.

## Price resolution waterfall

For each item, first hit wins, and everything below "supplier quote" is shown as *unconfirmed*:

1. Supplier quote still inside its validity.
2. Own history: same or similar item in past priced bids (text embedding + unit + key dimensions), indexed to today.
3. Benchmark / catalogue, if we get one.
4. Equivalent product (where the LV allows "oder gleichwertig") with a known price.
5. Model estimate with a wide band — never silently; flagged as a **price gap**.

Price gaps ranked by `qty × estimated price × band width` feed the RFQ queue.

## Build order

1. GAEB XML parser → model → items table in the browser. *(end-to-end skeleton first)*
2. GAEB 90 parser (gives us priced history from A, B, C).
3. Rule checks + findings UI.
4. LLM checks per title.
5. Risk score + change-order classification + report export.
6. PDF parser, validated against the GAEB twin.
7. Price suggestion from history; what-if.
8. Voice agent RFQ (time-boxed).

Steps 6–8 can run in parallel with 3–5 once the model is fixed, if we have the people.

## Evaluation we can actually do

- Parser: PDF-parsed items vs GAEB items of the same LV (projects A, B, D) — item count, quantity and unit match rate.
- Checks: seed known defects into a clean LV (swap a unit, change a quantity ×10, delete the "laying" item, break a
  DN) and measure how many we catch. Cheap, and a strong slide.
- Change orders: project A's 38 added award items as a qualitative test.
- Prices: leave-one-project-out on the three priced bids (expect weak results; say so).
