# Field insights from a practising civil engineer

Notes from a conversation with Atahan's brother (civil engineer), 2026-11-20, each assessed against the challenge.
Background for the terms used here is in `03-domain-primer.md`.

**Summary.** All seven points are real estimating practice. Five of them concern the *pricing* half of the challenge
(officially "optional") rather than the *error detection* half (officially "priority"). So they do not replace the
core — they define what makes our pricing part credible and different. One point (waste) is correct but belongs in a
different place than one would first assume.

| # | Insight | Verdict | Becomes |
|---|---------|---------|---------|
| 1 | A buffer on prices | Correct, relevant | Risk surcharge driven by price confidence; bid total as a range |
| 2 | Pull prices from the seller by email or phone | Correct, our differentiator | RFQ flow: email draft + voice agent |
| 3 | Part failure / waste rate when counting quantities | Correct, but not on the LV quantity | Waste factor in material cost and order quantity |
| 4 | The real unknown: no data for every item, nothing 100 % reliable, no live price | Correct, the central design principle | Every price has source, date, validity, confidence |
| 5 | No price → ask the seller of X first, else find an equivalent | Correct, relevant | Price-resolution waterfall incl. equivalent products |
| 6 | Sellers always ask which company is calling | Correct, a hard requirement for #2 | Company profile carried into every inquiry |
| 7 | Labour costs must be calculated | Correct, relevant | Unit price split into labour / material / equipment / other |

## 1. Price buffer

In German estimating this exists formally as **Wagnis** (risk, typically 2–4 % of the bid total) next to profit, plus
whatever caution the estimator puts into individual items.

A flat percentage is what everyone does. The better version: **the buffer follows the uncertainty.** An item priced
from a supplier quote received yesterday needs almost none; an item priced from a 2023 project, or by a model, on a
volatile material, with a large quantity, needs a lot. So:

- each price carries a low/high band (see `PricePoint` in `06-architecture.md`);
- the band widens with the age of the price, the volatility of the material, and a weaker source;
- the bid total is shown as a distribution (P50 / P80) from a simple simulation over the bands;
- the tool proposes the risk surcharge as "the amount that covers P80", and shows which ten items cause most of it.

That turns "add 5 % to be safe" into "these ten items are your uncertainty; confirm their prices and the buffer drops
from X to Y". It also connects the what-if milestone to something an estimator actually decides.

Caveat for the pitch: a buffer that is too high loses the bid. The message is *precise* buffers, not bigger ones.

## 2. Getting prices from sellers by email or phone

This is how it works in practice: for the material-heavy items of a bid, the estimator sends inquiries to two or
three suppliers and compares them in a Preisspiegel. It is slow, it is done under deadline pressure, and many
inquiries simply get no answer in time.

For the tool: generate the inquiry from the LV item (spec, quantity, site, delivery window), send or draft it, and
parse the answer back into a structured price. Email is the normal channel for a binding quote. Phone is the channel
for speed: an indicative price, availability, lead time, and **chasing** an unanswered email.

The voice agent concept is in `05-voice-agent.md`. This point is the justification for it: it is an existing
manual process, not an invented use case.

## 3. Failure rate / waste when counting parts

Correct that more material is bought than installed: cutting waste, breakage, losses, spare parts.
Typical values are in the primer (tiles 5–10 %, pipes 3–5 %, …).

But in a German unit-price contract **the LV quantity is given by the client and is the installed quantity**; payment
follows the measured installed quantity. The contractor does not add waste to the quantity. Waste shows up in two
other places:

- in the **material cost per unit** inside the unit price: `purchase price × (1 + waste factor)`;
- in the **order quantity** for the supplier inquiry: LV quantity × (1 + waste factor), rounded to packaging units.

So: a per-trade waste factor in the price build-up, and the RFQ asks for the order quantity, not the LV quantity.
Getting this distinction right in front of a jury of construction people matters.

A related check that *is* about LV quantities: are the quantities of related items consistent (pipe delivered vs pipe
laid vs trench length)? A mismatch there is a quantity-deviation candidate under VOB/B §2 Abs. 3.

## 4. The real unknown: incomplete data, no certainty, no live price

"What exists today may not exist tomorrow." This is the most important point, and it is confirmed by the research:
there is **no free unit-price database** for Germany, benchmarks are commercial and updated about twice a year,
supplier quotes are valid for weeks, and the bidder is bound for 30–60 days.

Consequences for the design:

- Never show a bare number. A price is `(value, source, date, valid until, confidence)`.
- Confidence decays with age; old history is indexed to today with public price indices where possible.
- "We do not know" is a valid output. An item with no reliable price is a **price gap**, shown as such, and price
  gaps ranked by money at stake are the to-do list.
- Flag the structural risk: execution period long, material volatile, no price escalation clause in the tender.
- Availability is part of the price. A quote should capture lead time and whether the product is still supplied.

For the pitch this is a strength: other tools will show confident AI prices. An estimator trusts the tool that says
what it does not know.

## 5. No price → ask the seller first, else find an equivalent

This is a resolution order, and it maps to the waterfall in `06-architecture.md`:

1. valid supplier quote → 2. own history → 3. benchmark → 4. **ask the supplier of the specified product** →
5. **equivalent product** → 6. model estimate with a wide band.

The equivalent-product step has a contractual side. Public tenders must be product-neutral, hence "oder
gleichwertig" — the bidder may offer an equivalent and must name it (the `Angebotenes Fabrikat: ........` fields in
our PDFs). So the tool should:

- detect items that name a product, and whether an equivalent is allowed;
- for those, extract the technical requirements (DN, pressure class, material, standard) an equivalent must meet;
- warn when a product is named **without** "oder gleichwertig" (single-source: price risk and, for public clients, a
  possible procurement violation → bidder question).

Project A in the dataset shows this in practice: the bidder added 38 optional items with their own unit prices, among
them "extra cost for valves in make VAG" — the product make was a price question the tender left open.

## 6. Sellers always ask which company you are

Because the price depends on it: customer discount group, credit standing, region, whether this is a real project.
An anonymous caller gets the list price or nothing.

So every inquiry needs a **company profile**: company name, customer number at that supplier if any, contact person,
callback number and email, project name and site location, bid deadline. The voice agent must state these up front
and must say for whom it is calling. It must also say that it is an AI assistant (see the legal section in
`05-voice-agent.md`). Corollary: scraping web shops gives list prices only — a weak signal, to be labelled as such.

## 7. Labour costs

A unit price is labour + materials + equipment + other, plus overheads. For many trades labour is the largest part,
and it does not come from a supplier: it is `hours per unit × calculation wage`.

For the tool:

- split every suggested unit price into the four components (the GAEB format has fields for exactly this split);
- labour from an hours-per-unit value (model-estimated with a band, since no free table exists) times a configurable
  wage; the real billing rates in our dataset (80–100 EUR/h) calibrate it;
- what-if then works per component: "+8 % wage agreement", "+15 % steel" hit different parts of different items;
- the supplier inquiry only resolves the **material** part — the UI should say so, so a material quote is not mistaken
  for a unit price.

## What this changes in the plan

- The pricing module is designed around **provenance and confidence**, not around a price-prediction model.
- **Price gaps** become a first-class object in the UI, next to findings.
- The RFQ loop (email + voice) is the differentiator, and it needs the company profile and order quantities.
- Unit prices are stored as four components from the start.

## Questions to take back to him

1. For which trades or materials is phoning normal, and where would a supplier refuse to give a price by phone?
2. How long does a material quote usually stay valid in his experience? Which materials are daily prices?
3. Would an indicative phone price be used in a bid, or only a written quote?
4. What does he check first when he opens a new LV? Which mistakes has he actually seen cost money?
5. Does his experience come from Germany or Turkey? (Unit-price contracts and who owns the quantities differ.)
6. Would a supplier talk to an AI caller at all? What would make them hang up?
