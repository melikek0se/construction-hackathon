"""Price inquiries: who is asked about which items of an LV, what came back, and which quote is taken.

How estimators do it (docs/09-price-inquiries.md): not every item is asked for. Items the firm prices from
what it knows are left alone; material without a current price goes to a few suppliers as one package per
material group; a trade the firm does not do itself goes as a whole to subcontractors, whose price is the
whole unit price before a surcharge. The replies are compared on what the goods cost on site (discount and
freight worked in), per package and not line by line, and a product other than the one tendered is a risk
the estimator has to take knowingly. An item with an open question to the client that cannot be priced as
written is not asked for until the client has answered.

What is here:
- the directory of suppliers and subcontractors (table `suppliers`) and the firm's own particulars,
- the plan for one LV (`plan`, asked of Claude): packages of items, each with the directory entries to ask,
- the inquiry as a German message with an Excel sheet to fill in (`compose`, `sheet`),
- the reply read into lines per item (`read_sheet` for the sheet, `read_quote` for free text, by Claude),
- the comparison per package and the proposal (`compare`), and the price each item ends up with
  (`item_prices`): from the quote taken, else an assumption from past bids, marked as one.

Nothing is sent from here: the estimator reads every message and sends it (boq.api, boq.mail).
"""
import hashlib
import io
import json
import re
import time
import uuid
from datetime import date, timedelta

import anthropic
from openpyxl import Workbook, load_workbook
from sqlalchemy import delete, insert, select, update

from boq import db, spend
from boq.checks.llm import _NO_CREDENTIALS, MODEL, REQUEST_TIMEOUT_S, LLMUnavailable
from boq.model import BoQ, Item

PRICE_INQUIRY = "price_inquiry"
KINDS = ("supplier", "subcontractor")
MAX_ASKED = 5  # per package: a supplier who is one of twenty asked stops answering (docs/09)
QUOTE_FRESH_DAYS = 90  # a quote that states no validity counts as a price at hand this long
MAX_REPLY_CHARS = 60_000

# ------------------------------------------------------------------ the firm, and the directory

COMPANY = {"name": "", "contact": "", "email": "", "phone": "", "place": "",
           # what the firm does with its own people, in words; everything else is a foreign trade
           "own_trades": "Tiefbau, Rohrleitungsbau, Erdarbeiten, Kanalbau",
           "nu_surcharge": 10.0}  # per cent on a subcontractor's price (usual: 8 to 15)


def company() -> dict:
    with db.engine().connect() as conn:
        kept = conn.execute(select(db.settings.c.value).where(db.settings.c.key == "company")).scalar()
    return {**COMPANY, **(kept or {})}


def set_company(values: dict) -> dict:
    new = {**company(), **{k: v for k, v in values.items() if k in COMPANY and v is not None}}
    with db.engine().begin() as conn:
        conn.execute(delete(db.settings).where(db.settings.c.key == "company"))
        conn.execute(insert(db.settings).values(key="company", value=new))
    return new


def _supplier(row) -> dict:
    return {"id": row.id, "name": row.name, "kind": row.kind, "email": row.email, "contact": row.contact,
            "phone": row.phone, "place": row.place, "groups": row.groups or [], "products": row.products or [],
            "note": row.note, "source": row.source, "created": row.created.isoformat(timespec="seconds")}


def suppliers() -> list[dict]:
    with db.engine().connect() as conn:
        rows = conn.execute(select(db.suppliers).order_by(db.suppliers.c.name)).all()
    return [_supplier(r) for r in rows]


def supplier(supplier_id: str) -> dict | None:
    with db.engine().connect() as conn:
        row = conn.execute(select(db.suppliers).where(db.suppliers.c.id == supplier_id)).first()
    return _supplier(row) if row else None


_FIELDS = ("name", "kind", "email", "contact", "phone", "place", "groups", "products", "note", "source")


def save_supplier(values: dict, supplier_id: str | None = None) -> dict:
    """A new entry of the directory, or a change to one: only the fields that are given."""
    values = {k: v for k, v in values.items() if k in _FIELDS and v is not None}
    for key in ("groups",):
        if key in values:
            values[key] = [str(g).strip() for g in values[key] if str(g).strip()]
    if "products" in values:
        values["products"] = [{"name": str(p.get("name", "")).strip(), "maker": str(p.get("maker", "")).strip()}
                              for p in values["products"] if str(p.get("name", "")).strip()]
    with db.engine().begin() as conn:
        if supplier_id is None:
            supplier_id = uuid.uuid4().hex[:12]
            conn.execute(insert(db.suppliers).values(
                id=supplier_id, created=db.now(),
                **{"name": "", "kind": "supplier", "email": "", "contact": "", "phone": "", "place": "",
                   "groups": [], "products": [], "note": "", "source": "user"} | values))
        elif values:
            conn.execute(update(db.suppliers).where(db.suppliers.c.id == supplier_id).values(**values))
    return supplier(supplier_id)


def remove_supplier(supplier_id: str) -> bool:
    with db.engine().begin() as conn:
        return bool(conn.execute(delete(db.suppliers).where(db.suppliers.c.id == supplier_id)).rowcount)


def learn(supplier_id: str, lines: list[dict]) -> None:
    """What a supplier offered in a quote is what it sells: the directory keeps it."""
    known = supplier(supplier_id)
    if known is None:
        return
    have = {p["name"].lower() for p in known["products"]}
    new = []
    for line in lines:
        name = (line.get("product") or "").strip()
        if name and name.lower() not in have:
            have.add(name.lower())
            new.append({"name": name[:120], "maker": ""})
    if new:
        save_supplier({"products": known["products"] + new}, supplier_id)


# ------------------------------------------------------------------ what is not asked for

def held(questions: list[dict]) -> tuple[dict[str, str], dict[str, str]]:
    """The items the client still has to say something about, from the bidder questions as they stand
    (mail.standing): `held` cannot be priced as written (a stop) and are not asked for until answered;
    `provisional` can be priced on an assumption and are asked for, marked. Each with its question."""
    wait, assume = {}, {}
    for q in questions:
        if q["status"] in ("answered",) or not q.get("item_oz"):
            continue
        (wait if q.get("severity") == "high" else assume).setdefault(q["item_oz"], q.get("question", ""))
    return wait, {oz: text for oz, text in assume.items() if oz not in wait}


def _same(text: str) -> str:
    return re.sub(r"[^a-z0-9äöüß]+", " ", (text or "").lower()).strip()


def _fresh(quote: dict, today: date) -> bool:
    until = (quote["terms"] or {}).get("valid_until") or ""
    try:
        return date.fromisoformat(until) >= today
    except ValueError:
        return date.fromisoformat(quote["created"][:10]) >= today - timedelta(days=QUOTE_FRESH_DAYS)


def at_hand(boq: BoQ, project_id: str | None) -> dict[str, dict]:
    """Items a quote kept from another tender still prices: the same short text and unit, the quote still
    valid (or, where it states no validity, not older than QUOTE_FRESH_DAYS). Nothing is asked for these."""
    today, names = date.today(), {s["id"]: s["name"] for s in suppliers()}
    known: dict[tuple[str, str], dict] = {}
    for q in all_quotes():
        if (q["project_id"], q["file"]) == (project_id, boq.file) or not _fresh(q, today):
            continue
        for line in q["lines"]:
            key = (_same(line.get("label", "")), line.get("unit", ""))
            if key[0] and (key not in known or q["created"] > known[key]["date"]):
                known[key] = {"unit_price": line["unit_price"], "supplier": names.get(q["supplier_id"], "a supplier"),
                              "date": q["created"][:10], "valid_until": (q["terms"] or {}).get("valid_until") or None,
                              "product": line.get("product", "")}
    return {i.oz: known[(_same(i.label), i.unit)] for i in boq.items if (_same(i.label), i.unit) in known}


# ------------------------------------------------------------------ the plan (Claude)

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "packages": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "kind": {"type": "string", "enum": ["material", "subcontract"]},
                    "why": {"type": "string"},
                    "items": {"type": "array", "items": {"type": "string"}},
                    "ask": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "kind", "why", "items", "ask"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["packages"],
    "additionalProperties": False,
}

PLAN_SYSTEM = """\
You work for the estimator of a German construction contractor who is pricing a tender. You are given the \
items of the bill of quantities (Leistungsverzeichnis), what the firm does with its own people, and the \
firm's directory of suppliers and subcontractors. Decide for which items a price has to be asked from \
outside, and group those items into packages that go out as one inquiry each.

There are three kinds of item:

- Own work without bought material worth asking for (site set-up, earth moved by the firm's own crew, \
demolition, hourly wage and equipment rates, traffic safety by own means, surveying, cleaning): the firm \
prices these itself. They go into NO package.
- Own work whose price is decided by material the firm has to buy (pipes, fittings, valves, manholes and \
precast parts, concrete, asphalt, gravel and sand delivered, steel, geotextile, pumps, cables): package of \
kind "material", one per material group, so that one merchant or manufacturer can quote the whole package. \
The supplier's price covers the material only.
- Work of a trade the firm does not do itself, judged by what the firm says it does: package of kind \
"subcontract", one per trade (electrical and control engineering, painting and coating, metalwork, \
scaffolding, flooring, HVAC, drilling by a specialist, laboratory tests ...). A subcontractor prices the \
whole items, labour and material.

Rules:

- name is the German name of the material group or trade as an estimator would write it on an inquiry \
("PE-Rohre und Formstücke", "Armaturen", "Schachtbauwerke Fertigteile", "Elektro- und MSR-Technik"). \
why is one English sentence on what makes these items one package and why they are asked for.
- items are the item numbers exactly as given. An item is in at most one package. Leave out items of the \
first kind, and items with quantity zero or without a unit of measure worth pricing.
- Prefer few packages of several items over many packages of one item: a supplier answers a list, not a \
line. A single item is a package of its own only if no other item shares its material group or trade.
- ask are ids from the directory, at most 5 per package, only entries whose kind fits (supplier for \
material, subcontractor for subcontract) and whose groups or products fit the package. Never invent an id. \
If nobody in the directory fits, ask is empty: the estimator then adds a supplier.
- The files are anonymised: tokens such as [FIRMA_044] or [ORT_024] replace product and place names. They \
are not errors; where a token replaces a required make, the package is still formed by what the item is.
"""


def _item_line(item: Item) -> str:
    qty = f"{item.qty:f}".rstrip("0").rstrip(".") if item.qty is not None else "-"
    return f"{item.oz} | {qty} {item.unit_raw or item.unit} | {item.label[:110]}"


async def plan(boq: BoQ, skip: set[str], client: anthropic.AsyncAnthropic | None = None) -> list[dict]:
    """The packages for one LV: which items are asked for, of whom. `skip`: items not to be asked for
    (they wait for the client, or a quote at hand prices them)."""
    items = [i for i in boq.items if i.oz not in skip and i.kind != "surcharge"]
    if not items:
        return []
    firm, directory = company(), suppliers()
    listed = "\n".join(f"{s['id']} | {s['kind']} | {s['name']} | sells: {', '.join(s['groups']) or '-'}"
                       + (f" | products: {', '.join(p['name'] for p in s['products'][:12])}" if s["products"] else "")
                       for s in directory) or "(the directory is empty)"
    client = client or anthropic.AsyncAnthropic(timeout=REQUEST_TIMEOUT_S)
    started = time.monotonic()
    try:
        response = await client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": PLAN_SCHEMA}},
            system=PLAN_SYSTEM,
            messages=[{"role": "user", "content":
                       f"<firm>\nDoes itself: {firm['own_trades']}\n</firm>\n\n"
                       f"<directory>\n{listed}\n</directory>\n\n"
                       f"<lv name=\"{boq.name or boq.project or boq.file}\">\n"
                       + "\n".join(_item_line(i) for i in items) + "\n</lv>"}],
        )
    except _NO_CREDENTIALS as exc:
        raise LLMUnavailable(
            "No working Claude API credentials. Put ANTHROPIC_API_KEY=... into .env in the repository "
            "root (see .env.example) and restart the server.") from exc
    spend.answered("price inquiries planned", response, MODEL, ms=round((time.monotonic() - started) * 1000))
    if response.stop_reason != "end_turn":
        raise RuntimeError(f"Planning the price inquiries stopped with {response.stop_reason}")
    raw = json.loads(next(b.text for b in response.content if b.type == "text"))["packages"]
    return check_plan(raw, items, directory)


def check_plan(raw: list[dict], items: list[Item], directory: list[dict]) -> list[dict]:
    """The model's packages held against the LV and the directory: unknown item numbers and ids are
    dropped, an item stays in the first package that names it, an empty package is left out."""
    known, by_id, taken, out = {i.oz for i in items}, {s["id"]: s for s in directory}, set(), []
    for p in raw:
        kind = "subcontract" if p.get("kind") == "subcontract" else "material"
        want = "subcontractor" if kind == "subcontract" else "supplier"
        ozs = [oz for oz in dict.fromkeys(p.get("items") or []) if oz in known and oz not in taken]
        if not ozs:
            continue
        taken.update(ozs)
        ask = [s for s in dict.fromkeys(p.get("ask") or []) if s in by_id and by_id[s]["kind"] == want][:MAX_ASKED]
        out.append({"id": f"p{len(out) + 1}", "name": str(p.get("name", "")).strip()[:80] or "Paket",
                    "kind": kind, "why": str(p.get("why", "")).strip()[:300], "items": ozs, "ask": ask})
    return out


def lv_hash(boq: BoQ) -> str:
    return hashlib.sha256("\n".join(_item_line(i) for i in boq.items).encode()).hexdigest()[:16]


def _plan_row(row) -> dict:
    return {"id": row.id, "project_id": row.project_id, "file": row.file, "plan": row.plan,
            "chosen": row.chosen or {}, "created": row.created.isoformat(timespec="seconds")}


def find_plan(project_id: str | None, file: str) -> dict | None:
    same = db.supply_plans.c.project_id.is_(None) if project_id is None else db.supply_plans.c.project_id == project_id
    with db.engine().connect() as conn:
        row = conn.execute(select(db.supply_plans).where(same, db.supply_plans.c.file == file)
                           .order_by(db.supply_plans.c.created.desc())).first()
    return _plan_row(row) if row else None


def keep_plan(project_id: str | None, file: str, plan_: dict, old: dict | None = None) -> dict:
    """Keep a plan for a file; it takes the place of the one before, and what was chosen stays for the
    packages that are still there under the same id and name."""
    # A package keeps its id over a new plan where it is still mostly the same items: the inquiries and
    # quotes kept under that id stay with it. The others get ids nobody had.
    before = {p["id"]: set(p["items"]) for p in (old or {"plan": {"packages": []}})["plan"]["packages"]}
    free, n = dict(before), 0
    for p in plan_["packages"]:
        same = max(free, key=lambda k: len(free[k] & set(p["items"])), default=None)
        if same is not None and len(free[same] & set(p["items"])) * 2 > len(free[same]):
            p["id"] = same
            del free[same]
        else:
            p["id"] = None
    for p in plan_["packages"]:
        while p["id"] is None:
            n += 1
            if f"p{n}" not in before and all(q["id"] != f"p{n}" for q in plan_["packages"]):
                p["id"] = f"p{n}"
    names = {p["id"]: p["name"] for p in plan_["packages"]}
    chosen = {k: v for k, v in ((old or {}).get("chosen") or {}).items() if k in names}
    same = db.supply_plans.c.project_id.is_(None) if project_id is None else db.supply_plans.c.project_id == project_id
    with db.engine().begin() as conn:
        conn.execute(delete(db.supply_plans).where(same, db.supply_plans.c.file == file))
        conn.execute(insert(db.supply_plans).values(id=uuid.uuid4().hex, project_id=project_id, file=file,
                                                    created=db.now(), plan=plan_, chosen=chosen))
    return find_plan(project_id, file)


def change_plan(plan_id: str, plan_: dict | None = None, chosen: dict | None = None) -> None:
    values = {k: v for k, v in (("plan", plan_), ("chosen", chosen)) if v is not None}
    with db.engine().begin() as conn:
        conn.execute(update(db.supply_plans).where(db.supply_plans.c.id == plan_id).values(**values))


# ------------------------------------------------------------------ the inquiry

def _day(iso: str | None) -> str:
    try:
        return f"{date.fromisoformat(iso or ''):%d.%m.%Y}"
    except ValueError:
        return ""


def reply_by(dates: dict) -> str | None:
    """The day a quote is needed by: three days before the submission, never in the past."""
    try:
        due = date.fromisoformat(dates.get("due") or "")
    except ValueError:
        return None
    return max(due - timedelta(days=3), date.today() + timedelta(days=1)).isoformat() if due > date.today() else None


def compose(lv: dict, package: dict, items: list[Item], to: dict, dates: dict) -> tuple[str, str]:
    """Subject and text of the inquiry about one package to one directory entry, in German. It says who
    asks and for which job, lists the items as the LV has them, and asks for what makes replies comparable:
    price per item free to site, the make offered, freight, discount, terms of payment, validity."""
    firm, sub = company(), package["kind"] == "subcontract"
    name = lv.get("name") or lv.get("file") or ""
    subject = f"{'Angebotsanfrage Nachunternehmerleistung' if sub else 'Preisanfrage'} – {package['name']} – {name}"
    us = firm["name"] or "wir"
    lines = [f"Guten Tag {to['contact']}," if to.get("contact") else "Sehr geehrte Damen und Herren,", "",
             (f"{us} kalkuliert" if firm["name"] else "wir kalkulieren") + f" derzeit ein Angebot für das Bauvorhaben „{name}“"
             + (f" ({lv['number']})" if lv.get("number") and lv["number"] not in name else "")
             + (f" und bittet" if firm["name"] else " und bitten")
             + (f" um Ihr Angebot als Nachunternehmer für die folgenden Leistungen ({package['name']}), einschließlich "
                f"Material, Lohn und Gerät:" if sub else
                f" um Ihre Preise für folgende Positionen ({package['name']}):"), ""]
    for item in items:
        qty = f"{item.qty:f}".rstrip("0").rstrip(".").replace(".", ",") if item.qty is not None else "–"
        lines.append(f"Pos. {item.oz} – {qty} {item.unit_raw or item.unit} – {item.label}")
        more = " ".join(item.long_text.split())
        if more and more != item.label:
            lines.append(f"    {more[:320]}{'…' if len(more) > 320 else ''}")
    lines += ["", "Bitte nennen Sie je Position:",
              "- den Einheitspreis netto" + ("" if sub else ", frei Baustelle (bei Preisen ab Werk oder Lager bitte die Fracht gesondert)"),
              "- das angebotene Fabrikat mit Typ; weicht es vom ausgeschriebenen ab, kennzeichnen Sie es bitte "
              "ausdrücklich als Alternative",
              "- die Lieferzeit" if not sub else "- den möglichen Ausführungszeitraum",
              "sowie Rabatt, Skonto und Zahlungsziel und bis wann Ihr Angebot gilt."]
    if _day(dates.get("binding_until")):
        lines.append(f"Wir sind gegenüber dem Auftraggeber bis {_day(dates['binding_until'])} an unser Angebot gebunden "
                     f"und bitten Sie, Ihre Preise bis dahin zu halten.")
    lines += ["", "Die Mengen sind die Mengen des Leistungsverzeichnisses (eingebaute Mengen, ohne Verschnitt).",
              "Die Positionen liegen als Excel-Datei bei; Sie können Ihre Preise dort eintragen und zurücksenden."]
    if sub:
        lines.append("Der Auftrag ist uns noch nicht erteilt; im Auftragsfall gelten die VOB/B und die "
                     "Vertragsbedingungen des Auftraggebers auch für Ihre Leistung.")
    if _day(reply_by(dates)):
        lines.append(f"Wir benötigen Ihr Angebot bis {_day(reply_by(dates))}.")
    lines += ["", "Vielen Dank und freundliche Grüße"]
    lines += [x for x in (firm["contact"], firm["name"], firm["place"], firm["phone"], firm["email"]) if x]
    return subject, "\n".join(lines) + "\n"


def remind(mail_: dict, dates: dict) -> tuple[str, str]:
    """A short reminder about an inquiry that was not answered."""
    firm = company()
    lines = ["Sehr geehrte Damen und Herren,", "",
             f"am {_day(mail_['sent_at'][:10] if mail_['sent_at'] else mail_['created'][:10])} haben wir Sie um Ihre Preise gebeten "
             f"(„{mail_['subject']}“). Können Sie uns ein Angebot zusenden"
             + (f", möglichst bis {_day(reply_by(dates))}" if _day(reply_by(dates)) else "") + "?",
             "Eine kurze Absage hilft uns ebenfalls. Die Positionen finden Sie unten.", "",
             "Vielen Dank und freundliche Grüße"]
    lines += [x for x in (firm["contact"], firm["name"], firm["phone"]) if x]
    return f"Erinnerung: {mail_['subject']}", "\n".join(lines) + "\n\n----\n" + mail_["body"]


SHEET_HEAD = ["Pos.", "Kurztext", "Menge", "Einheit", "Einheitspreis netto (EUR)", "Angebotenes Fabrikat / Typ",
              "Alternative zum ausgeschriebenen Produkt (ja/nein)", "Bemerkung"]
TERMS_ROWS = [("basis", "Preise frei Baustelle (ja/nein)"), ("freight", "Fracht pauschal netto (EUR), falls nicht frei Baustelle"),
              ("discount_pct", "Rabatt auf alle Positionen (%)"), ("skonto", "Skonto / Zahlungsziel"),
              ("valid_until", "Angebot gültig bis (TT.MM.JJJJ)")]


def sheet(asked: list[dict]) -> bytes:
    """The items of an inquiry as an Excel file the supplier fills in: one row per item, the price columns
    empty, and the terms on a second sheet. The same file comes back and is read by `read_sheet`."""
    book = Workbook()
    page = book.active
    page.title = "Positionen"
    page.append(SHEET_HEAD)
    for item in asked:
        page.append([item["oz"], item["label"], item["qty"], item["unit"], None, None, None, None])
    for column, width in zip("ABCDEFGH", (12, 60, 12, 10, 24, 34, 30, 40)):
        page.column_dimensions[column].width = width
    terms = book.create_sheet("Konditionen")
    for _, label in TERMS_ROWS:
        terms.append([label, None])
    terms.column_dimensions["A"].width = 60
    terms.column_dimensions["B"].width = 30
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def _number(value) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    text = re.sub(r"[^\d,.\-]", "", str(value))
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _iso(value) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()[:10]
    m = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", str(value or ""))
    if m:
        try:
            return date(int(m[3]), int(m[2]), int(m[1])).isoformat()
        except ValueError:
            return ""
    return str(value)[:10] if re.fullmatch(r"\d{4}-\d\d-\d\d.*", str(value or "")) else ""


def read_sheet(data: bytes, asked: list[dict]) -> dict:
    """The filled-in sheet read back: a line per row that carries a price, matched by its item number."""
    book = load_workbook(io.BytesIO(data), data_only=True)
    page = book["Positionen"] if "Positionen" in book.sheetnames else book.worksheets[0]
    lines = []
    for row in page.iter_rows(min_row=2, values_only=True):
        row = list(row) + [None] * 8
        price = _number(row[4])
        if row[0] is None or price is None:
            continue
        said = str(row[6] or "").strip().lower()
        lines.append({"pos": str(row[0]).strip(), "unit_price": price, "unit": str(row[3] or "").strip(),
                      "product": str(row[5] or "").strip(), "alternative": said in ("ja", "j", "yes", "x", "1", "true"),
                      "note": str(row[7] or "").strip(), "quote": None})
    terms = dict.fromkeys(("basis", "freight", "discount_pct", "skonto", "valid_until", "binding", "note"))
    if "Konditionen" in book.sheetnames:
        said = {key: (list(row) + [None, None])[1]
                for (key, _), row in zip(TERMS_ROWS, book["Konditionen"].iter_rows(values_only=True))}
        free = str(said.get("basis") or "").strip().lower()
        terms |= {"basis": "free_to_site" if free.startswith("j") or free == "yes" else "ex_works" if free.startswith("n") else "unknown",
                  "freight": _number(said.get("freight")), "discount_pct": _number(said.get("discount_pct")),
                  "skonto": str(said.get("skonto") or "").strip(), "valid_until": _iso(said.get("valid_until"))}
    return match_lines(asked, None, lines, terms)


QUOTE_SCHEMA = {
    "type": "object",
    "properties": {
        "terms": {
            "type": "object",
            "properties": {
                "basis": {"type": "string", "enum": ["free_to_site", "ex_works", "unknown"]},
                "freight": {"type": "number"},
                "discount_pct": {"type": "number"},
                "skonto": {"type": "string"},
                "valid_until": {"type": "string"},
                "binding": {"type": "string", "enum": ["binding", "non_binding", "unknown"]},
                "note": {"type": "string"},
            },
            "required": ["basis", "freight", "discount_pct", "skonto", "valid_until", "binding", "note"],
            "additionalProperties": False,
        },
        "lines": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "pos": {"type": "string"},
                    "unit_price": {"type": "number"},
                    "unit": {"type": "string"},
                    "product": {"type": "string"},
                    "alternative": {"type": "boolean"},
                    "quote": {"type": "string"},
                    "note": {"type": "string"},
                },
                "required": ["pos", "unit_price", "unit", "product", "alternative", "quote", "note"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["terms", "lines"],
    "additionalProperties": False,
}

QUOTE_SYSTEM = """\
You work for the estimator of a German construction contractor. The estimator asked a supplier or a \
subcontractor for prices on items of a bill of quantities (Leistungsverzeichnis). You are given the items \
as they were asked, with their item numbers, and the reply as it arrived (the text of an e-mail or of a \
quote). Read the reply into one line per item it prices, and its terms.

Lines:

- pos is the item number of the ASKED item the price belongs to, exactly as given in <asked>. Suppliers \
often renumber (1, 2, 3 ...), quote by their own article numbers, or name the product only: match by what \
is described, its size and its unit. If a line of the reply cannot be matched to an asked item with \
confidence, give pos as "" and say in note what it is: it is shown to the estimator as unmatched and never \
guessed.
- unit_price is the net price per unit as the reply states it, as a number. unit is the unit the reply \
prices in (m, St, t, m3 ...). Do not convert: if the reply prices per 6 m bar or per pallet, give that \
price and that unit and say so in note.
- product is the make and type the reply offers for this item, as written; empty if it names none.
- alternative is true when the reply offers something other than what was asked for (another make, \
material, size or standard), whether or not it says so.
- quote is the passage of the reply with this price, copied character for character, at most 200 \
characters, without ellipses or words of your own. A quote that is not in the reply is discarded and the \
line with it.
- note is at most one English sentence on anything the estimator must know about this line (minimum \
quantity, delivery time, per-bar price, excluded part). Empty if nothing.
- An asked item the reply does not price gets no line.

Terms, for the whole reply:

- basis: free_to_site if the prices include delivery to the site ("frei Baustelle", "frei Haus", "inkl. \
Fracht"), ex_works if freight comes on top ("ab Werk", "ab Lager", "zzgl. Fracht"), else unknown.
- freight: the freight charge as a net amount in EUR if the reply states one, else -1.
- discount_pct: a discount on all prices in per cent if the reply states one and the prices given are \
before it, else -1. If the prices already include it, -1 and say so in note.
- skonto: cash discount and term of payment as written ("3 % in 10 Tagen, 30 Tage netto"), else empty.
- valid_until: the day the quote is valid until as YYYY-MM-DD if stated or computable from a stated \
period and the date of the reply, else empty.
- binding: non_binding if the reply says "freibleibend", "unverbindlich" or that prices are daily prices \
("Tagespreis"); binding if it states a binding period or validity; else unknown.
- note: one English sentence on anything else that decides the comparison (partial quote, minimum order \
value, surcharge for small quantities). Empty if nothing.

Say only what the reply says. The files are anonymised: tokens such as [FIRMA_044] replace names.
"""


async def read_quote(asked: list[dict], reply: str, client: anthropic.AsyncAnthropic | None = None) -> dict:
    """A reply in free text read against the items of the inquiry: terms, lines per item, the lines that
    could not be matched, and how many were dropped because their passage is not in the reply."""
    if len(reply) > MAX_REPLY_CHARS:
        raise ValueError(f"The reply is longer than {MAX_REPLY_CHARS:,} characters. Paste the quote itself.")
    client = client or anthropic.AsyncAnthropic(timeout=REQUEST_TIMEOUT_S)
    listed = "\n".join(f"{i['oz']} | {i['qty'] if i['qty'] is not None else '-'} {i['unit']} | {i['label']}" for i in asked)
    started = time.monotonic()
    try:
        response = await client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": QUOTE_SCHEMA}},
            system=QUOTE_SYSTEM,
            messages=[{"role": "user", "content": f"<asked>\n{listed}\n</asked>\n\n<reply>\n{reply}\n</reply>"}],
        )
    except _NO_CREDENTIALS as exc:
        raise LLMUnavailable(
            "No working Claude API credentials. Put ANTHROPIC_API_KEY=... into .env in the repository "
            "root (see .env.example) and restart the server.") from exc
    spend.answered("quote read", response, MODEL, ms=round((time.monotonic() - started) * 1000))
    if response.stop_reason != "end_turn":
        raise RuntimeError(f"Reading the quote stopped with {response.stop_reason}")
    raw = json.loads(next(b.text for b in response.content if b.type == "text"))
    return match_lines(asked, reply, raw["lines"], raw["terms"])


def _squash(text: str) -> str:
    return " ".join((text or "").split())


def match_lines(asked: list[dict], reply: str | None, raw: list[dict], terms: dict) -> dict:
    """What was read held against what was asked: a line counts for an item only if its item number was
    asked and (for free text) its passage stands in the reply; the first line per item wins. The rest is
    `unmatched`, shown and never used. A unit other than the asked one is flagged, not converted."""
    by_oz = {i["oz"]: i for i in asked}
    loose = {re.sub(r"^0+(?=\d)", "", re.sub(r"(?i)^pos\.?\s*", "", oz)).strip(): oz for oz in by_oz}
    text, lines, unmatched, dropped = _squash(reply or ""), {}, [], 0
    for line in raw:
        pos = re.sub(r"^0+(?=\d)", "", re.sub(r"(?i)^pos\.?\s*", "", str(line.get("pos") or ""))).strip()
        price = line.get("unit_price")
        quote = _squash(line.get("quote") or "").strip("…\"„“' ")
        if reply is not None and (len(quote) < 3 or quote not in text):
            dropped += 1
            continue
        if not isinstance(price, int | float) or price <= 0:
            continue
        oz = loose.get(pos)
        entry = {"unit_price": round(float(price), 4), "unit": str(line.get("unit") or "").strip(),
                 "product": str(line.get("product") or "").strip()[:160], "alternative": bool(line.get("alternative")),
                 "note": str(line.get("note") or "").strip()[:300], "quote": quote[:240]}
        if oz is None or oz in lines:
            unmatched.append({**entry, "pos": str(line.get("pos") or "")})
            continue
        want = by_oz[oz]
        lines[oz] = {**entry, "oz": oz, "label": want["label"],
                     "unit_differs": bool(entry["unit"]) and _unit(entry["unit"]) != _unit(want["unit"])}
    clean = {"basis": terms.get("basis") if terms.get("basis") in ("free_to_site", "ex_works") else "unknown",
             "freight": terms["freight"] if isinstance(terms.get("freight"), int | float) and terms["freight"] > 0 else None,
             "discount_pct": terms["discount_pct"] if isinstance(terms.get("discount_pct"), int | float)
             and 0 < terms["discount_pct"] < 100 else None,
             "skonto": str(terms.get("skonto") or "").strip()[:120], "valid_until": _iso(terms.get("valid_until")),
             "binding": terms.get("binding") if terms.get("binding") in ("binding", "non_binding") else "unknown",
             "note": str(terms.get("note") or "").strip()[:300]}
    return {"terms": clean, "lines": [lines[i["oz"]] for i in asked if i["oz"] in lines],
            "unmatched": unmatched, "dropped": dropped}


def _unit(text: str) -> str:
    from boq.units import normalise_unit

    return normalise_unit(text) or text.strip().lower().rstrip(".")


# ------------------------------------------------------------------ quotes kept

def _quote(row) -> dict:
    return {"id": row.id, "project_id": row.project_id, "file": row.file, "mail_id": row.mail_id,
            "supplier_id": row.supplier_id, "package": row.package, "terms": row.terms, "lines": row.lines,
            "created": row.created.isoformat(timespec="seconds")}


def all_quotes() -> list[dict]:
    with db.engine().connect() as conn:
        return [_quote(r) for r in conn.execute(select(db.quotes).order_by(db.quotes.c.created))]


def quotes_for(project_id: str | None, file: str) -> list[dict]:
    same = db.quotes.c.project_id.is_(None) if project_id is None else db.quotes.c.project_id == project_id
    with db.engine().connect() as conn:
        return [_quote(r) for r in conn.execute(select(db.quotes).where(same, db.quotes.c.file == file)
                                                .order_by(db.quotes.c.created))]


def keep_quote(mail_: dict, file: str, read: dict, text: str) -> dict:
    """Keep what was read from a reply; a second reply to the same inquiry takes the place of the first."""
    quote_id = uuid.uuid4().hex[:12]
    meta = mail_["meta"] or {}
    with db.engine().begin() as conn:
        conn.execute(delete(db.quotes).where(db.quotes.c.mail_id == mail_["id"]))
        conn.execute(insert(db.quotes).values(
            id=quote_id, created=db.now(), project_id=mail_["project_id"], file=file, mail_id=mail_["id"],
            supplier_id=meta.get("supplier_id"), package=meta.get("package", ""), terms=read["terms"],
            lines=read["lines"], text=text))
    if meta.get("supplier_id"):
        learn(meta["supplier_id"], read["lines"])
    return next(q for q in all_quotes() if q["id"] == quote_id)


# ------------------------------------------------------------------ the comparison

def _net(line: dict, terms: dict) -> float:
    return line["unit_price"] * (1 - (terms.get("discount_pct") or 0) / 100)


def compare(package: dict, items: dict[str, Item], quotes: list[dict], names: dict[str, str], dates: dict) -> dict:
    """The quotes for one package side by side, on what the goods cost on site: the discount taken off every
    price, the freight added once per supplier. Cash discount (Skonto) is shown and not worked in. Two ways
    to take them: one supplier for the whole package, or the cheapest per item with every supplier's
    freight; and which of the two the numbers speak for, with the reason. A line in another unit than the
    asked one, or for another product, is counted but flagged: the estimator decides."""
    ozs = [oz for oz in package["items"] if oz in items]
    qty = {oz: float(items[oz].qty or 0) for oz in ozs}
    today, columns = date.today().isoformat(), []
    need = dates.get("binding_until") or dates.get("due") or ""
    for q in quotes:
        lines = {line["oz"]: line for line in q["lines"] if line["oz"] in qty}
        terms = q["terms"]
        goods = sum(qty[oz] * _net(line, terms) for oz, line in lines.items())
        freight = terms.get("freight") or 0
        flags = []
        if len(lines) < len(ozs):
            flags.append(f"{len(ozs) - len(lines)} of {len(ozs)} items not priced")
        if n := sum(line["alternative"] for line in lines.values()):
            flags.append(f"{n} other product{'' if n == 1 else 's'} than tendered: name make and type in the bid and prove it equivalent")
        if n := sum(line.get("unit_differs", False) for line in lines.values()):
            flags.append(f"{n} price{'' if n == 1 else 's'} in another unit than asked: not comparable as it stands")
        if terms.get("binding") == "non_binding":
            flags.append("not binding (freibleibend)")
        if terms.get("valid_until") and terms["valid_until"] < today:
            flags.append(f"expired on {_day(terms['valid_until'])}")
        elif terms.get("valid_until") and need and terms["valid_until"] < need:
            flags.append(f"valid until {_day(terms['valid_until'])}, before your bid stops binding ({_day(need)})")
        if terms.get("basis") == "ex_works" and not freight:
            flags.append("ex works, freight not stated")
        if terms.get("basis") == "unknown":
            flags.append("does not say whether delivery is included")
        columns.append({"quote": q["id"], "supplier_id": q["supplier_id"], "supplier": names.get(q["supplier_id"], "?"),
                        "date": q["created"][:10], "terms": terms, "covered": len(lines), "goods": round(goods, 2),
                        "freight": freight, "total": round(goods + freight, 2), "flags": flags,
                        "lines": {oz: {**line, "net": round(_net(line, terms), 4)} for oz, line in lines.items()}})
    full = sorted((c for c in columns if c["covered"] == len(ozs)), key=lambda c: c["total"])
    single = full[0] if full else None
    # the cheapest per item; a line in another unit cannot be compared and is passed over where there is another
    split, used = {}, set()
    for oz in ozs:
        offers = [(c["lines"][oz].get("unit_differs", False), c["lines"][oz]["net"], c) for c in columns if oz in c["lines"]]
        if offers:
            _, net, column = min(offers, key=lambda o: (o[0], o[1]))
            split[oz] = {"quote": column["quote"], "net": net}
            used.add(column["quote"])
    split_total = round(sum(qty[oz] * s["net"] for oz, s in split.items())
                        + sum(c["freight"] for c in columns if c["quote"] in used), 2)
    proposal = None
    if single and (len(used) <= 1 or split_total >= single["total"] * 0.97):
        proposal = {"mode": "single", "quote": single["quote"],
                    "why": f"{single['supplier']} prices all {len(ozs)} items; " + (
                        "it is the only complete quote." if len(columns) == 1 or len(used) <= 1 else
                        f"the cheapest line per item from {len(used)} suppliers comes to {_eur(split_total)} with their freight, "
                        "which is no less than this one quote." if split_total >= single["total"] else
                        f"taking the cheapest line from each of {len(used)} suppliers saves "
                        f"{_eur(single['total'] - split_total)}, less than 3 %, for {len(used)} orders instead of one.")}
    elif single:
        proposal = {"mode": "split", "quote": None,
                    "why": f"the cheapest line per item from {len(used)} suppliers comes to {_eur(split_total)} with their freight, "
                           f"{_eur(single['total'] - split_total)} under the best single quote ({single['supplier']})."}
    elif columns:
        best = max(columns, key=lambda c: (c["covered"], -c["total"]))
        proposal = {"mode": "split" if len(split) > best["covered"] else "single",
                    "quote": None if len(split) > best["covered"] else best["quote"],
                    "why": f"no quote prices all {len(ozs)} items; {best['supplier']} prices {best['covered']}, "
                           f"together the quotes price {len(split)}. What is left is assumed from past bids or asked again."}
    return {"columns": columns, "single": single["quote"] if single else None,
            "split": {"lines": split, "total": split_total, "suppliers": len(used), "covered": len(split)},
            "proposal": proposal}


def _eur(value: float) -> str:
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " EUR"


def item_prices(plan_: dict, chosen: dict, comparisons: dict[str, dict], items: dict[str, Item],
                wait: dict[str, str], hand: dict[str, dict], assumed: dict[str, dict]) -> dict[str, dict]:
    """Where the price of every item comes from, as it stands: `waits` for the client, `at_hand` (a quote
    kept from another tender), `quoted` (a quote for it is in, taken or proposed), `asked` (in a package,
    no quote yet), `assumed` from past bids where nothing better is there, `own` (no inquiry: the firm
    prices it) or `none`. A supplier's price is the material part only; a subcontractor's is the whole
    unit price, with the firm's surcharge on it."""
    surcharge, out, in_package = company()["nu_surcharge"], {}, {}
    for p in plan_["packages"]:
        for oz in p["items"]:
            in_package[oz] = p
    for oz in items:
        guess = assumed.get(oz)
        fallback = ({"status": "assumed", "unit_price": guess["unit_price"], "source": "past bids",
                     "low": guess["low"], "high": guess["high"], "part": "unit price"}
                    if guess and guess.get("unit_price") is not None else None)
        if oz in wait:
            out[oz] = {"status": "waits", "why": wait[oz]}
        elif oz in hand:
            out[oz] = {"status": "at_hand", "unit_price": hand[oz]["unit_price"], "source": hand[oz]["supplier"],
                       "date": hand[oz]["date"], "valid_until": hand[oz]["valid_until"], "part": "material"}
        elif oz in in_package:
            p = in_package[oz]
            cmp, choice = comparisons.get(p["id"]) or {}, chosen.get(p["id"]) or {}
            picked = choice or (cmp.get("proposal") or {})
            line = column = None
            if picked.get("mode") == "single":
                column = next((c for c in cmp.get("columns", []) if c["quote"] == picked.get("quote")), None)
                line = column["lines"].get(oz) if column else None
            elif picked.get("mode") == "split":
                pick = cmp.get("split", {}).get("lines", {}).get(oz)
                column = next((c for c in cmp.get("columns", []) if pick and c["quote"] == pick["quote"]), None)
                line = column["lines"].get(oz) if column else None
            if line and picked.get("mode") != "assume":
                sub = p["kind"] == "subcontract"
                out[oz] = {"status": "quoted", "taken": bool(choice), "source": column["supplier"], "date": column["date"],
                           "unit_price": round(line["net"] * (1 + surcharge / 100), 4) if sub else line["net"],
                           "valid_until": column["terms"].get("valid_until") or None, "alternative": line["alternative"],
                           "product": line["product"],
                           "part": f"unit price incl. {surcharge:g} % on the subcontractor" if sub else "material"}
            else:
                out[oz] = {**(fallback or {"status": "asked"}), "package": p["id"]}
                if fallback:
                    out[oz]["instead_of"] = "no quote for it yet"
        else:
            out[oz] = fallback or {"status": "own"}
    return out


def tally(project_id: str) -> dict | None:
    """How the price inquiries of a project stand, for its card: packages, inquiries still to send, out
    without a reply, answered; None while nothing is planned."""
    with db.engine().connect() as conn:
        plans = conn.execute(select(db.supply_plans.c.plan).where(db.supply_plans.c.project_id == project_id)).all()
        mails = conn.execute(select(db.mails.c.id, db.mails.c.sent_at, db.mails.c.meta)
                             .where(db.mails.c.project_id == project_id, db.mails.c.kind == PRICE_INQUIRY)).all()
        answered = {r.mail_id for r in conn.execute(select(db.quotes.c.mail_id).where(db.quotes.c.project_id == project_id))}
    if not plans:
        return None
    wanted = {(p["id"], s) for (plan_,) in plans for p in plan_["packages"] for s in p["ask"]}
    written = {((m.meta or {}).get("package"), (m.meta or {}).get("supplier_id")) for m in mails if m.sent_at}
    return {"packages": sum(len(plan_["packages"]) for (plan_,) in plans),
            "to_send": len(wanted - written),
            "out": sum(1 for m in mails if m.sent_at and m.id not in answered),
            "answered": len(answered),
            "held": sum(len(plan_.get("held") or {}) for (plan_,) in plans)}
