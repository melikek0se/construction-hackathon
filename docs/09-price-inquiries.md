# Price inquiries to suppliers and subcontractors

Research of 2026-11-21 (three web researches, German sources where they exist) and what was built from it
(`src/boq/supply.py`, D-044). Evidence marks: **[R]** the page was read, **[S]** seen in a search snippet only,
**[NF]** searched for and not found. What the people who set the challenge told Atahan is marked **[told]**.

## How it is done

- **Lists go to several suppliers, the replies are compared, the most sensible one is taken** [told]. German:
  Preisanfrage / Lieferantenanfrage, compared in a Preisspiegel.
- **Not every item is asked for.** Material prices mostly sit in the firm's master data; a supplier is asked
  where no current price is at hand.
  [R] https://www.bauprofessor.de/kalkulation-stoffkosten/ · https://www.bauprofessor.de/vorarbeiten-angebotskalkulation/
- **An inquiry is a package, not a line**: an "Ausschreibungs-LV" cut from the bid LV goes out as GAEB, Excel
  or PDF and comes back as GAEB or Excel, for up to 8 bidders. Free-text replies mean retyping.
  [R] https://www.softguide.de/programm/baumanager-zusatzpaket-ausschreibung · https://www.diekaelte.de/sites/default/files/ulmer/file_175545.pdf
- **What an inquiry names**: use of the material, required properties, article numbers, sizes.
  [R] https://www.bauprofessor.de/lieferantenanfrage/ — a complete published template was [NF].
- **Compared is the cost on site** (Einstandspreis frei Baustelle): item discounts off, freight on (one quote
  "frei Baustelle", the other "ab Werk" plus freight); the cash discount (Skonto) is shown below and is not
  put into the calculation. Chosen per item, per LV title, or one supplier overall.
  [R] https://www.bauprofessor.de/preisspiegel-einkauf-stoffe/ · diekaelte PDF above
- **A supplier's price is the material part of a unit price only**: consumption × purchase price, plus a
  loss surcharge; labour, equipment and overheads come on top.
  [R] https://www.bauprofessor.de/kalkulation-stoffkosten/
- **A trade the firm does not do is priced by a subcontractor**, whose net price enters as its own cost type
  ("Fremdleistungen") with a surcharge of about 10 % (8 to 15 %); VHB Formblatt 221 has a column for it.
  The unit of inquiry is an LV title or the whole trade LV (Vergabeeinheit), sent as GAEB to several firms.
  [R] https://www.bauprofessor.de/fremdleistungen/ · https://www.bauprofessor.de/preisangaben-zu-nachunternehmer/ · https://www.bauprofessor.de/vergabeeinheiten/
- **No subcontractor quote in time: the price is assumed** [told]. No German source describes how [NF];
  indirect: experience values from earlier calculations [S], reference prices (Cosuno sells them per LV item
  [S]). The risk has a name: after the award the trade is bought for more or less than calculated
  (Vergabeverlust / Vergabegewinn). The bidder is bound for the binding period, the subcontractor is not
  unless asked to be. [R] https://www.bauprofessor.de/vergabeliste-nachunternehmerleistungen/ · https://www.bauprofessor.de/nachunternehmer-mehrkosten/
- **Another product than the tendered one is a bid risk.** The bidder must name make and type; "Leitfabrikat
  oder gleichwertig" as an answer led to exclusion (VK Bund, 16.05.2023, VK 2-28/23), and equivalence has to
  be proven with the bid. [R] https://blog.cosinex.de/2023/09/05/leitfabrikat-oder-gleichwertig/ · https://www.ibau.de/akademie/glossar/gleichwertigkeit/
- **Quotes are often not binding** ("freibleibend"): validity has to be asked for and held against the
  tender's binding period. [S] https://www.deutsche-handwerks-zeitung.de/?p=296140
- **Asking many makes fewer answer.** US data on subcontractor invitations: 9–15 % answer a broad invitation,
  47 % a targeted one; firms that see 15–20 invited per trade put the asker last; 5–6 asked for 3 answers.
  [R, vendor's own research] https://www.constructconnect.com/blog/how-many-subcontractor-bids-per-trade-2026-coverage-guidelines-for-gcs
- **Existing tools force the reply into the asker's lines** (portal form, GAEB, Excel); reading free PDFs is a
  newer add-on with a human reconcile step, unmatched lines shown with a reason.
  [R] https://help.cosuno.com/en/articles/4338273-submit-a-bid · https://fieldmaterials.com/platform/quotes
- **Cold e-mail to a supplier is legally grey.** BGH 17.07.2008, I ZR 75/06: a purchase inquiry is
  advertising under § 7 UWG, allowed to a published address about what the firm normally sells; today's
  wording asks for express consent for e-mail and whether the old case law still holds was [NF].
  [R] https://www.rechtslupe.de/zivilrecht/grenzen-gewerblicher-nachfrage-per-telefax-und-e-mail-34292 — not legal advice.

Not found at all: how long suppliers take to answer and how many never do; whether "three quotes" is a norm
in commercial buying; anything specific to civil works and pipe merchants; German data on merchants ignoring
bidders who never order. These are questions for a practitioner (`OPEN_QUESTIONS.md`).

## What our data can and cannot give

An LV names the manufacturer of a required product, never who sells it, and in the dataset the names are
anonymised: of 1,506 items in the GAEB XML files 80 mention a make or type, 52 say "oder gleichwertig", 54
carry a `[FIRMA_…]` token. So the directory cannot be read from past LVs. It is filled by the estimator and
by the quotes that come in (what a supplier offered is kept as what it sells).

## What is built (D-044)

1. **Directory** (`suppliers`, dialog "Suppliers" in the band): suppliers and subcontractors with what each
   sells in the estimator's words, and the firm's own particulars (who is asking, what its own people do,
   the surcharge on subcontractors).
2. **Plan** (`supply.plan`, Claude; pipeline step `P-INQUIRIES`, or "Plan the inquiries"): items the firm's
   own people do are left out; material goes into one package per material group, a foreign trade into one
   package for subcontractors; at most five directory entries per package. Left out before the model sees
   them: items with an open question that cannot be priced as written (they wait for the client), and items
   a kept quote from another tender still prices. The model's answer is held against the LV and the
   directory (`check_plan`).
3. **Inquiry** (`compose`, `sheet`): a German message per package and supplier that says who asks and for
   which job, lists the items as the LV has them, and asks for price free to site, make and type (another
   product to be marked as one), freight, discount, terms of payment and validity (to the end of our
   binding period, where the tender states one); the items as an Excel sheet to fill in. Nothing is sent
   without the estimator reading it. A reminder is one click and also read first.
4. **Reply** (`read_sheet`, `read_quote`): the filled-in sheet is read as it is; free text or a PDF is read by
   Claude into one line per item, and a line counts only if its passage stands in the reply and its item was
   asked. What fits no item is shown apart and never used. A price in another unit is flagged, not converted.
   With an inbox in `.env` the replies are looked for by the Message-ID of the inquiry (Utku's `find_replies`).
5. **Comparison** (`compare`): per package the quotes side by side on cost on site, with coverage, validity
   and flags (items missing, another product, another unit, not binding, expired, valid for less long than
   our bid binds, freight not stated); the best complete quote against the cheapest line per item with every
   supplier's freight, and a proposal with its reason. The estimator takes one, the split, or none.
6. **Price per item** (`item_prices`): waits for the client / a quote at hand / quoted / asked, no quote yet /
   assumed from past bids / own. A taken subcontractor price goes into the bid with the surcharge
   (`…/supply/to-bid`); a supplier's price does not, it is the material part only.

Left out on purpose: the app sending or reminding by itself; choosing an equivalent product by itself;
finding suppliers on the web (the legal point above);
wholesaler interfaces (IDS, Datanorm); waste factors on order quantities (the inquiry says the quantities are
the LV's); the three-way split of a unit price, so a supplier's price stands beside the bid, not in it.

## Since D-047 (2026-11-22)

The directory is the Partners page (`src/boq/partners.py`, `web/src/Partners.tsx`): per firm its prices
with their dates, how it behaves, every message and call, how it writes. Two points of the list above
changed: firms are looked for on the web (as candidates the estimator takes in; the app still writes to
nobody on its own), and an inquiry is worded the way the firm is written to, opening and closing only.

Since D-049: an item with an earlier price is asked for all the same; the price book (quotes of other
tenders) stands in until the quote is there and goes before past bids. See `docs/DECISIONS.md`.
