// Mock-ups of the tender page: three layouts over the same two tenders. Data is real (dataset projects B
// and F, read by the app's parsers); the dates are examples, the files state none.
const D = window.DATA;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const tok = (s) => esc(s).replace(/\[[A-ZÄÖÜ]+_\d+\]/g, (m) => `<span class="tk" title="Anonymised in the dataset">${m}</span>`);
const qty = (q) => (q == null ? "" : Number(q).toLocaleString("de-DE", { maximumFractionDigits: 3 }));
const KIND = {
  lump_sum: ["P", "Lump sum"],
  hourly: ["H", "Hourly work"],
  contingency: ["B", "Contingency item (Bedarfsposition)"],
  alternative: ["W", "Alternative item (Wahlposition)"],
  surcharge: ["Z", "Surcharge (Zulage)"],
};

function sectionsOf(lv) {
  const out = [];
  const by = new Map();
  for (const it of lv.items) {
    const name = it.path[lv.depth] ?? it.path[0] ?? "";
    if (!by.has(name)) {
      const s = { name, no: it.oz.split(".").slice(0, lv.depth + 1).join("."), items: [] };
      by.set(name, s);
      out.push(s);
    }
    by.get(name).items.push(it);
  }
  return out;
}
function lvOf(id, no, label, items, depth, extra = {}) {
  const lv = { id, no, label, items, depth, ...extra };
  lv.sections = sectionsOf(lv);
  lv.special = items.filter((i) => i.kind !== "normal").length;
  lv.diffs = items.filter((i) => i.diff).length;
  return lv;
}
const TENDERS = {
  B: {
    key: "B",
    no: "15145",
    name: "Ringschluss Brunnenwasser",
    client: "[FIRMA_005]",
    lvs: [lvOf("0", null, "Leistungsverzeichnis", D.B.items, 0)],
    dates: [
      { what: "Questions until", day: "Fri 27.11.2026", left: "in 5 days", next: true },
      { what: "Submission", day: "Tue 08.12.2026, 10:00", left: "in 16 days" },
      { what: "Bid binding until", day: "Fri 22.01.2027", left: "" },
      { what: "Execution", day: "03.2027 to 11.2027", left: "" },
    ],
    docs: [
      { name: "[NUMMER_001]_leer.X83", kind: "GAEB XML", role: "Request for bids (phase 83)", has: "248 items, 54 passages of remarks", gave: "Item numbers, structure, quantities, units, texts", back: "The bid goes back on this file, as X84" },
      { name: "Leistungsverzeichnis_leer.pdf", kind: "PDF", role: "The client's print-out, 78 pages", has: "248 items, 87 passages of remarks", gave: "The pages every item is shown on; 33 passages of remarks that are in no other file", back: null },
    ],
    back: "X84, written onto the client's X83",
    sum: "<b>One LV from 2 documents.</b> Same 248 items, quantities and units in both; 28 texts differ.",
  },
  F: {
    key: "F",
    no: "79-222",
    name: D.F.project,
    client: null,
    lvs: D.F.lvs.map((l, n) => lvOf(String(n), (l.file.match(/^LV_([0-9]+[a-z]?)_/) || [])[1] ?? String(n), l.label, l.items, 1, { file: l.file, pages: l.pages })),
    dates: [
      { what: "Questions until", day: "Wed 02.12.2026", left: "in 10 days", next: true },
      { what: "Submission", day: "Mon 14.12.2026, 12:00", left: "in 22 days" },
      { what: "Bid binding until", day: "Fri 29.01.2027", left: "" },
      { what: "Execution", day: "04.2027 to 06.2028", left: "" },
    ],
    docs: D.F.lvs.map((l) => ({ name: l.file, kind: "PDF", role: `${l.label}, ${l.pages} pages`, has: `${l.items.length} items`, gave: "Everything: no second file of this LV", back: null })),
    back: "Not stated in the files. No GAEB file came with this tender.",
    sum: "<b>27 LVs, one PDF each.</b> No second document of any LV, so nothing to compare.",
  },
};
for (const t of Object.values(TENDERS)) t.items = t.lvs.reduce((n, l) => n + l.items.length, 0);

const S = { opt: "research", proj: "B", lv: null, sec: null, item: null, drawer: false, marked: false, q: "", asked: new Set(), remarks: false };
const [h1, h2] = location.hash.slice(1).split("/");
if (["research", "a", "b", "c"].includes(h1)) S.opt = h1;
if (h2 === "B" || h2 === "F") S.proj = h2;

const T = () => TENDERS[S.proj];
const single = () => T().lvs.length === 1;
const curLv = () => (single() ? T().lvs[0] : T().lvs.find((l) => l.id === S.lv) ?? null);
const lvTitle = (lv) => (lv.no != null ? `${lv.no} ${lv.label}` : lv.label);
const itemOf = () => {
  if (!S.item) return null;
  const lv = T().lvs.find((l) => l.id === S.item.lv);
  const it = lv?.items.find((i) => i.oz === S.item.oz);
  return it ? { lv, it } : null;
};

// ---- shared pieces ----
function marks(it, cls = "mk") {
  let m = "";
  if (it.kind !== "normal") m += `<span class="${cls}" title="${KIND[it.kind][1]}">${KIND[it.kind][0]}</span>`;
  if (it.diff) m += `<span class="${cls} diff" title="The documents differ here">≠</span>`;
  return m;
}
function strip(lv, items, mini = false, dead = false) {
  if (dead) return `<span class="strip mini">${items.map((it) => `<i class="${it.diff ? "blk diff" : it.kind !== "normal" ? "blk" : "tick"}"></i>`).join("")}</span>`;
  return `<div class="strip${mini ? " mini" : ""}">${items
    .map((it) => {
      const sel = S.item && S.item.lv === lv.id && S.item.oz === it.oz ? " sel" : "";
      const a = `data-act="item" data-lv="${lv.id}" data-oz="${it.oz}"`;
      if (it.diff) return `<button class="blk diff${sel}" ${a} aria-label="Item ${it.oz}, the documents differ">${mini ? "" : "≠"}</button>`;
      if (it.kind !== "normal") return `<button class="blk${sel}" ${a} aria-label="Item ${it.oz}, ${KIND[it.kind][1]}">${mini ? "" : KIND[it.kind][0]}</button>`;
      return `<button class="tick${sel}" ${a} aria-label="Item ${it.oz}"></button>`;
    })
    .join("")}</div>`;
}
const key = () =>
  `<div class="key label"><span><i class="tick"></i>Item</span><span><i class="blk">P</i>Lump sum</span><span><i class="blk">H</i>Hourly</span><span><i class="blk">B</i>Contingency</span><span><i class="blk">Z</i>Surcharge</span>${single() ? '<span><i class="blk diff">≠</i>Documents differ</span>' : ""}</div>`;
function band() {
  const t = T();
  return `<header class="band"><button class="band-back"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 2.5 4.5 8 10 13.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>Projects</button>
  <span class="plate">${t.no}</span><h1 lang="de">${esc(t.name)}</h1>
  <div class="actions"><button class="btn plain">Add files</button><button class="btn plain">Settings</button></div></header>`;
}
function stages() {
  const t = T();
  const st = [
    ["Tender", `${t.lvs.length === 1 ? "1 LV" : t.lvs.length + " LVs"} · ${t.items.toLocaleString("en")} items · ${t.docs.length} documents`],
    ["Check", "next"],
    ["Questions", "next"],
    ["Prices", "next"],
    ["Bid", "next"],
    ["Award", "next"],
  ];
  return `<nav class="stages" aria-label="Where the tender stands">${st
    .map(([n, s], i) => `<button class="stage ${i === 0 ? "on" : "later"}" ${i ? 'tabindex="-1" title="Not part of this mock-up"' : 'aria-current="step"'}><b><i>${i + 1}</i>${n}</b><span>${s}</span></button>`)
    .join("")}</nav>`;
}
const datesRow = () => `<div class="dates">${T().dates.map((d) => `<div class="date${d.next ? " next" : ""}"><span class="label">${d.what}</span><b>${d.day}</b><small>${d.left || "&nbsp;"}</small></div>`).join("")}</div>`;
const docsLine = () => `<div class="docs-line"><span>${T().sum}</span><button class="text-link" data-act="drawer">Documents</button></div>`;

function sheet() {
  const s = itemOf();
  if (!s) return `<div class="sheet-empty"><span class="label">Item</span><p style="margin-top:6px">Pick an item to read its full text and see where it stands in the client's documents.</p></div>`;
  const { lv, it } = s;
  const t = T();
  const id = `${lv.id}:${it.oz}`;
  const where = single()
    ? `<div><span class="tag">GAEB XML</span><span>${tok(t.docs[0].name)}</span><span>item ${it.oz}</span></div>
       <div><span class="tag">PDF</span><span>${tok(t.docs[1].name)}</span><span>${it.page ? "page " + it.page : "not found"}</span></div>`
    : `<div><span class="tag">PDF</span><span>${tok(lv.file)}</span><span>page ${it.page ?? "?"}</span></div>`;
  let differ = "";
  if (it.diff) {
    const only = it.diff.pdf_only.filter(Boolean);
    differ = `<div class="differ"><h4>The two documents differ here</h4>
      ${only.length ? `<p>Only in the PDF print-out:</p>${only.map((l) => `<span class="quote" lang="de">${tok(l)}</span>`).join("")}` : `<p>The wording is ${Math.round(it.diff.alike * 100)} % alike. Quantity and unit are the same in both.</p>`}
      <div class="row">${S.asked.has(id) ? '<span class="tag ink">Question drafted</span><span style="font-size:12.5px;color:var(--mute)">waits in Questions</span>' : `<button class="btn ink sm" data-act="ask" data-id="${id}">Draft a bidder question</button><button class="btn out sm" data-act="item-close">Same meaning, leave it</button>`}</div></div>`;
  }
  return `<div class="sheet">
    <div style="display:flex"><span class="crumb" lang="de">${single() ? "" : esc(lvTitle(lv)) + " › "}${tok(it.path.join(" › "))}</span><button class="close" data-act="item-close">Close</button></div>
    <div class="oz">${it.oz}</div>
    <h2 lang="de">${tok(it.short)}</h2>
    <div class="q"><b>${qty(it.qty) || "no quantity"}</b><span>${esc(it.unit)}</span>${it.kind !== "normal" ? `<span class="tag">${KIND[it.kind][1]}</span>` : ""}</div>
    ${differ}
    <h3 class="label">Text of the item</h3>
    <div class="long" lang="de">${tok(it.long || it.short)}</div>
    <h3 class="label">Where it stands</h3>
    <div class="where">${where}</div>
  </div>`;
}

function drawer() {
  const t = T();
  const b = single();
  const diffs = b ? t.lvs[0].items.filter((i) => i.diff) : [];
  return `<div class="drawer-veil" data-act="drawer-close"><aside class="drawer" role="dialog" aria-label="Documents of this tender">
    <header><h2>Documents of this tender</h2><button class="btn plain sm" data-act="drawer-close">Close</button></header>
    <div class="body">
      <p style="margin-top:14px;max-width:62ch">The page shows the tender, not a file. Every document the client sent is read, and each gives what it has. Where two documents say different things, that is a point for the client.</p>
      ${b ? `<h3 class="label">The two documents against each other</h3>
      <div class="agree"><div><b class="fig">248 / 248</b><small>items are in both</small></div><div><b class="fig">0</b><small>quantities differ</small></div><div><b class="fig">0</b><small>units differ</small></div><div><b class="fig">28</b><small>texts differ</small></div></div>` : ""}
      <h3 class="label">${b ? "What each one gave" : `${t.docs.length} documents, one per LV`}</h3>
      ${t.docs
        .slice(0, b ? 2 : 6)
        .map((d) => `<div class="doc"><div class="top"><span class="tag ink">${d.kind}</span><span class="name">${tok(d.name)}</span></div><dl><dt>Is</dt><dd lang="de">${tok(d.role)}</dd><dt>Holds</dt><dd>${d.has}</dd><dt>Used for</dt><dd>${d.gave}</dd>${d.back ? `<dt>Bid</dt><dd>${d.back}</dd>` : ""}</dl></div>`)
        .join("")}
      ${b ? "" : `<p style="margin-top:10px;color:var(--mute);font-size:13px">and 21 more, the same way.</p>`}
      <h3 class="label">The bid goes back as</h3><p>${t.back}</p>
      <h3 class="label">Not among the files</h3><p>Cover letter, conditions of the tender, plans. The app says so; whether they exist is for you to know.</p>
      ${b ? `<h3 class="label">28 items whose text differs</h3>${diffs
        .map((i) => `<div class="diffrow"><b>${i.oz}</b><div><span lang="de">${tok(i.short)}</span>${i.diff.pdf_only[0] ? `<q lang="de">${tok(i.diff.pdf_only[0])}</q><small>only in the PDF</small>` : `<br><small>wording ${Math.round(i.diff.alike * 100)} % alike</small>`}</div><button class="btn out sm" data-act="item" data-lv="0" data-oz="${i.oz}">Open</button></div>`)
        .join("")}` : ""}
    </div></aside></div>`;
}

// ---- A: register ----
function viewA() {
  const t = T();
  const lv = curLv();
  let tree = `<span class="label">${single() ? "This LV" : "This tender"}</span>
    <button class="root" data-act="lv" data-lv="" aria-current="${!S.remarks && (single() ? !S.sec : !lv)}"><b></b><span>${single() ? "All sections" : `All ${t.lvs.length} LVs`}</span><small>${t.items}</small></button>
    ${single() ? `<button data-act="remarks" aria-current="${S.remarks}"><b></b><span>Preliminary remarks</span><small>87</small></button>` : ""}`;
  if (single()) tree += lv.sections.map((s) => `<button data-act="sec" data-sec="${esc(s.name)}" aria-current="${!S.remarks && S.sec === s.name}"><b>${s.no}</b><span lang="de">${tok(s.name)}</span><small>${s.items.length}</small></button>`).join("");
  else
    tree += t.lvs
      .map(
        (l) =>
          `<button data-act="lv" data-lv="${l.id}" aria-current="${lv === l && !S.sec}"><b>${l.no}</b><span lang="de">${tok(l.label)}</span><small>${l.items.length}</small></button>` +
          (lv === l && l.sections.length > 1 ? l.sections.map((s) => `<button class="sub" data-act="sec" data-sec="${esc(s.name)}" aria-current="${S.sec === s.name}"><b>${s.no}</b><span lang="de">${tok(s.name)}</span><small>${s.items.length}</small></button>`).join("") : ""),
      )
      .join("");

  let mid;
  if (S.remarks && single()) {
    mid = `<div class="mid-head"><h2>Preliminary remarks</h2><span class="label">54 passages in the GAEB file, 33 more only in the PDF</span></div>
      <div class="scroll" style="padding:14px 20px 40px">${D.B.remarks.slice(0, 6).map((r) => `<div class="long" lang="de" style="background:var(--tint);padding:10px 12px;margin-bottom:10px;white-space:pre-wrap;font-size:13.5px;max-width:76ch">${tok(r.text)}</div>`).join("")}</div>`;
  } else if (!lv) {
    mid = `<div class="mid-head"><h2>${t.lvs.length} LVs of this tender</h2><span class="label">${t.items} items</span></div>
      <div class="scroll"><table><thead><tr><th class="first">LV</th><th>Trade</th><th class="num">Items</th><th class="num">Sections</th><th class="num">Not plain</th><th class="num">Pages</th><th style="width:38%">Its items in order</th></tr></thead><tbody>
      ${t.lvs.map((l) => `<tr class="lv" data-act="lv" data-lv="${l.id}"><td class="ozc first">${l.no}</td><td lang="de"><b style="font-weight:600">${tok(l.label)}</b></td><td class="num">${l.items.length}</td><td class="num">${l.sections.length}</td><td class="num">${l.special || ""}</td><td class="num">${l.pages}</td><td>${strip(l, l.items, true)}</td></tr>`).join("")}
      </tbody></table></div>`;
  } else {
    const ql = S.q.trim().toLowerCase();
    const secs = lv.sections.filter((s) => !S.sec || s.name === S.sec);
    let shown = 0;
    const rows = secs
      .map((s) => {
        const its = s.items.filter((i) => (!S.marked || i.diff || i.kind !== "normal") && (!ql || i.oz.startsWith(ql) || (i.short + " " + i.long).toLowerCase().includes(ql)));
        if (!its.length) return "";
        shown += its.length;
        return (
          `<tr class="sec"><td class="first" colspan="6" lang="de">${s.no} &nbsp;${tok(s.name)}</td></tr>` +
          its.map((i) => `<tr class="it${S.item && S.item.lv === lv.id && S.item.oz === i.oz ? " sel" : ""}" data-act="item" data-lv="${lv.id}" data-oz="${i.oz}"><td class="ozc first">${i.oz}</td><td>${marks(i)}</td><td lang="de">${tok(i.short)}</td><td class="num">${qty(i.qty)}</td><td>${esc(i.unit)}</td><td class="src num">${i.page ? "p. " + i.page : ""}</td></tr>`).join("")
        );
      })
      .join("");
    mid = `<div class="mid-head"><h2 lang="de">${S.sec ? tok(S.sec) : single() ? "All sections" : tok(lvTitle(lv))}</h2><span class="label">${shown} of ${lv.items.length}</span>
      <input id="q" type="search" placeholder="Item no. or text" value="${esc(S.q)}" aria-label="Find an item" />
      <button class="toggle" data-act="marked" aria-pressed="${S.marked}"><i></i>Only marked</button></div>
      <div class="scroll"><table><thead><tr><th class="first">Item</th><th></th><th>Short text</th><th class="num">Quantity</th><th>Unit</th><th class="num">PDF</th></tr></thead><tbody>${rows || `<tr><td class="first" colspan="6" style="color:var(--mute)">No item fits.</td></tr>`}</tbody></table></div>`;
  }
  return `<div class="a" style="display:contents">
    <div class="facts"><div class="who"><b lang="de">${t.client ? tok(t.client) : "Client not named in the files"}</b><small>${single() ? "1 LV" : t.lvs.length + " LVs"}, ${t.items} items</small></div>${datesRow()}${docsLine()}</div>
    <div class="work"><nav class="tree scroll" aria-label="Structure">${tree}</nav><main class="mid">${mid}</main><aside class="side scroll${S.item ? "" : " none"}">${sheet()}</aside></div></div>`;
}

// ---- B: cover sheet + map ----
function viewB() {
  const t = T();
  const lv = curLv();
  const cover = `<aside class="cover scroll">
    <h2 lang="de">${esc(t.name)}</h2><p class="client" lang="de">${t.client ? "Client " + tok(t.client) : "Client not named in the files"}</p>
    <section><span class="label">Dates</span><div class="dl">${t.dates.map((d) => `<div>${d.what}<small>${d.left || "&nbsp;"}</small></div><b><span class="${d.next ? "next" : ""}">${d.day}</span></b>`).join("")}</div></section>
    <section><span class="label">What came</span>
      ${single() ? t.docs.map((d) => `<div class="file"><span class="tag">${d.kind}</span> <b>${tok(d.name)}</b><small>${d.has}</small></div>`).join("") : `<div class="file"><span class="tag">PDF</span> <b>27 print-outs, one per LV</b><small>${t.items} items on ${t.lvs.reduce((n, l) => n + l.pages, 0)} pages</small></div>`}
      ${single() ? `<div class="cmp"><b>248 / 248</b> items in both · <b>0</b> quantities differ · <b>28</b> texts differ</div>` : `<div class="cmp">No second document of any LV: nothing to compare.</div>`}
      <button class="btn out sm" data-act="drawer">What each document gave</button></section>
    <section><span class="label">The bid goes back as</span><p style="font-size:13px;padding-top:6px">${t.back}</p></section>
    <section><span class="label">Not among the files</span><p style="font-size:13px;padding-top:6px;color:var(--mute)">Cover letter, conditions, plans.</p></section>
  </aside>`;
  let rows, head;
  if (!lv) {
    head = `<h2>${t.lvs.length} LVs</h2><span class="label">${t.items} items · click a name to go into an LV</span>`;
    rows = t.lvs.map((l) => `<div class="maprow"><div class="hd"><span class="ix">${l.no}</span><button class="maprow-t" lang="de" data-act="lv" data-lv="${l.id}">${tok(l.label)}</button><span class="label">${l.special ? l.special + " not plain · " : ""}${l.items.length} items · ${l.pages} pages</span></div>${strip(l, l.items)}</div>`).join("");
  } else {
    head = single() ? `<h2>LV map</h2><span class="label">${lv.sections.length} sections · ${lv.items.length} items</span>` : `<div class="crumbs"><button data-act="lv" data-lv="">All ${t.lvs.length} LVs</button><span>›</span><b lang="de">${tok(lvTitle(lv))}</b></div><span class="label">${lv.sections.length} sections · ${lv.items.length} items</span>`;
    rows = lv.sections.map((s) => {
      const sp = s.items.filter((i) => i.kind !== "normal").length, df = s.items.filter((i) => i.diff).length;
      return `<div class="maprow"><div class="hd"><span class="ix">${s.no}</span><span class="maprow-t" lang="de" style="font:600 14.5px/1.25 Barlow">${tok(s.name)}</span><span class="label">${df ? df + " differ · " : ""}${sp ? sp + " not plain · " : ""}${s.items.length} items</span></div>${strip(lv, s.items)}</div>`;
    }).join("");
  }
  return `<div class="b" style="display:contents"><div class="work${S.item ? " open" : ""}">${cover}
    <main class="main"><div class="main-head">${head}${key()}</div><div class="scroll" style="flex:1">${rows}</div><div class="readout" id="readout">One mark per item, in LV order. Point at a mark to read it, click to open it.</div></main>
    ${S.item ? `<aside class="side scroll">${sheet()}</aside>` : ""}</div></div>`;
}

// ---- C: reader ----
function viewC() {
  const t = T();
  const lv = curLv() ?? t.lvs[0];
  const sel = itemOf();
  const outline = `<nav class="outline scroll" aria-label="Contents">
    <button data-act="goto" data-to="cover"><div class="t"><b></b><span>Cover sheet</span></div></button>
    ${single() ? `<button data-act="goto" data-to="remarks"><div class="t"><b></b><span>Preliminary remarks</span><small>87</small></div></button>` : ""}
    ${single()
      ? lv.sections.map((s, n) => `<button data-act="goto" data-to="sec${n}"><div class="t"><b>${s.no}</b><span lang="de">${tok(s.name)}</span><small>${s.items.length}</small></div>${strip(lv, s.items, true, true)}</button>`).join("")
      : t.lvs.map((l) => `<button data-act="lv" data-lv="${l.id}" aria-current="${l === lv}"><div class="t"><b>${l.no}</b><span lang="de">${tok(l.label)}</span><small>${l.items.length}</small></div>${strip(l, l.items, true, true)}</button>`).join("")}
  </nav>`;
  const coverPage = `<article class="page" id="cover"><h2 lang="de">${t.no} ${esc(t.name)}</h2><p class="sub" lang="de">${t.client ? "Client " + tok(t.client) + " · " : ""}${single() ? "1 LV" : t.lvs.length + " LVs"} · ${t.items} items</p>
    <div class="cv">${t.dates.map((d) => `<div><span>${d.what}</span><b>${d.day}</b></div>`).join("")}<div><span>The bid goes back as</span><span style="text-align:right">${single() ? "X84 on the client's X83" : "not stated"}</span></div><div><span>Read from</span><button class="text-link" style="font-weight:600;text-decoration:underline;text-underline-offset:3px" data-act="drawer">${t.docs.length} documents</button></div></div>
    <div class="toc">${single() ? lv.sections.map((s, n) => `<button data-act="goto" data-to="sec${n}"><b>${s.no}</b><span lang="de">${tok(s.name)}</span><small>${s.items.length} items</small></button>`).join("") : t.lvs.map((l) => `<button data-act="lv" data-lv="${l.id}"><b>${l.no}</b><span lang="de">${tok(l.label)}</span><small>${l.items.length} items · ${l.pages} p.</small></button>`).join("")}</div></article>`;
  const remarksPage = single() ? `<article class="page" id="remarks"><h2>Preliminary remarks</h2><p class="sub">54 passages in the GAEB file; 33 more stand only in the PDF and are set in after them.</p><div class="rem" lang="de">${tok(D.B.remarks[1]?.text || D.B.remarks[0].text).slice(0, 2600)}</div></article>` : "";
  const body = `<article class="page">${single() ? "" : `<h2 lang="de" style="margin-bottom:14px">${tok(lvTitle(lv))}</h2>`}${lv.sections
    .map(
      (s, n) =>
        `<div class="sech" id="sec${n}" lang="de">${s.no} &nbsp;${tok(s.name)}</div>` +
        s.items
          .map((i) => {
            const on = sel && sel.it === i;
            const id = `${lv.id}:${i.oz}`;
            let notes = "";
            if (i.diff) {
              const o = i.diff.pdf_only.filter(Boolean)[0];
              notes += `<div class="note diff"><b>The documents differ</b>${o ? `Only in the PDF: <span lang="de">„${tok(o)}“</span>` : `Wording ${Math.round(i.diff.alike * 100)} % alike`}<div class="row">${S.asked.has(id) ? '<span class="tag ink">Question drafted</span>' : `<button class="btn ink sm" data-act="ask" data-id="${id}">Draft a question</button>`}</div></div>`;
            }
            if (i.kind !== "normal") notes += `<div class="note"><b>${KIND[i.kind][1]}</b>${{ lump_sum: "One price for all of it; the text is the whole scope.", hourly: "Paid by the hour on proof.", contingency: "Carried out only when ordered.", alternative: "In place of another item if chosen.", surcharge: "On top of the item it names." }[i.kind]}</div>`;
            if (on) notes += `<div class="note src">${single() ? `GAEB XML item ${i.oz} · PDF page ${i.page ?? "?"}` : `${tok(lv.file)}, page ${i.page ?? "?"}`}</div>`;
            return `<div class="pos${on ? " sel" : ""}" data-act="item" data-lv="${lv.id}" data-oz="${i.oz}" id="p${i.oz}"><div class="n">${i.oz}</div><div><div class="s" lang="de">${tok(i.short)}</div>${i.long && i.long.trim() !== i.short.trim() ? `<div class="l" lang="de">${tok(i.long)}</div>` : ""}</div><div class="qu">${qty(i.qty)} ${esc(i.unit)}<small>${i.page ? "p. " + i.page : ""}</small></div>${notes ? `<div class="notes">${notes}</div>` : ""}</div>`;
          })
          .join(""),
    )
    .join("")}${!single() && t.lvs.indexOf(lv) < t.lvs.length - 1 ? `<button class="btn ink more" data-act="lv" data-lv="${t.lvs[t.lvs.indexOf(lv) + 1].id}">Next LV: ${esc(lvTitle(t.lvs[t.lvs.indexOf(lv) + 1]))}</button>` : ""}</article>`;
  return `<div class="c" style="display:contents"><div class="slim">${datesRow()}${docsLine()}</div>
    <div class="work">${outline}<main class="paper-wrap scroll" id="paper"><div class="paper">${S.lv && !single() ? "" : coverPage + remarksPage}${body}</div></main></div></div>`;
}

// ---- research (for the team; Turkish) ----
function research() {
  return `<div class="research"><div class="in" lang="tr">
  <h1>İhale sayfası: araştırma ve seçenekler</h1>
  <p class="lead">Soru: estimator bir ihaleyi açtığında dosya mı görmeli, ihale mi? Aşağıdaki hükümler kaynaklara (Alman ihale mevzuatı, ORCA ve iTWO kılavuzları, IHK kontrol listesi) ve kendi veri setimizdeki ölçüme dayanıyor. Üç seçenek aynı modeli kullanır; fark, ihalenin nasıl okunduğunda.</p>

  <h2>Üç varsayım, üç hüküm</h2>
  <div class="verdicts">
    <div><span class="tag ink">Büyük ölçüde doğru</span><q>Format önemli değil; tek arayüzden bütün datayı görmeliyim.</q><p>Okuma ve fiyatlama için doğru: her AVA programı dosyayı kendi LV modeline alır, kimse dosyanın içinde çalışmaz. Ama format dört yerde geri gelir (aşağıda). Sayfada dosya seçtirmek yanlış; kaynağı tek tıkla göstermek şart.</p></div>
    <div><span class="tag">Kısmen, kanıt zayıf</span><q>Kullanıcılar GAEB XML ile çalışıyor.</q><p>XML resmî standart (Bayern: yalnız XML 3.1+). Ama WEKA ve Dangl GAEB 90'ın hâlâ çok yaygın olduğunu yazıyor; güncel pay rakamı yok. Bizim veride 4 XML, 5 GAEB 90, 34 PDF var; 27 LV'li proje yalnız PDF. Üçü de birinci sınıf girdi olmalı.</p></div>
    <div><span class="tag ink">Doğru</span><q>Bir proje tek LV de olabilir, çok LV de; tek görünüm ikisini taşımalı.</q><p>Bir Los = bir LV = bir dosya (VHF Bayern). Los, tek LV'nin içinde en üst seviye de olabilir (ORCA, NEVARIS). iTWO ve ORCA: proje → LV'ler → bölümler → pozisyonlar. Tek LV, çok LV'nin özel hâli.</p></div>
  </div>

  <h2>Ölçtük: aynı ihalenin iki formatı ne kadar farklı?</h2>
  <table><thead><tr><th>İhale</th><th>Belgeler</th><th class="num">Pozisyon</th><th class="num">Miktar farkı</th><th class="num">Birim farkı</th><th class="num">Metni farklı</th></tr></thead><tbody>
  <tr><td>A 8209.003</td><td>X83 · D83</td><td class="num">159 / 159</td><td class="num">0</td><td class="num">0</td><td class="num">0</td></tr>
  <tr><td>A 8209.003</td><td>X83 · PDF paketi</td><td class="num">159 / 159</td><td class="num">0</td><td class="num">0</td><td class="num">2</td></tr>
  <tr><td>B 15145</td><td>X83 · PDF çıktı</td><td class="num">248 / 248</td><td class="num">0</td><td class="num">0</td><td class="num">28</td></tr>
  <tr><td>D 152516</td><td>X83 · PDF çıktı</td><td class="num">50 / 50</td><td class="num">0</td><td class="num">0</td><td class="num">28</td></tr>
  </tbody></table>
  <ul>
    <li><b>616 pozisyonda tek bir miktar ya da birim farkı yok.</b> İhale aşamasında formatlar aynı LV'yi anlatıyor: senin tezini destekliyor.</li>
    <li>Metin farklarının bir kısmı gerçek (D'de kısa metinler PDF'te başka; B'de "STLB-Bau 2016-10" satırı yalnız PDF'te), bir kısmı bizim PDF okuyucumuzun satır kırması. "Metni farklı" = %90'dan az benzer. Bunlar soru adayı, hata değil.</li>
    <li><b>Belgeler aynı şeyin kopyası değil, birbirini tamamlıyor.</b> B'de PDF'te 87 ön açıklama pasajı var, X83'te 54. Teklif aşamasında D84 yalnız fiyat taşır (metin ve miktar yok), metin PDF'tedir. Yani "birini seç" hiçbir zaman tam ihaleyi vermez; birleştirmek gerekir.</li>
    <li>Teklif aşamasında gerçek fark var: B'nin D84'ü ile teslim edilen PDF'i 2 pozisyonda başka fiyat taşıyor (1.1.1: 16.000 ve 26.000).</li>
  </ul>

  <h2>Karşı düşünceler: formatın geri geldiği dört yer</h2>
  <ul>
    <li><b>Geri gönderim.</b> Teklif tam istenen biçimde dönmeli. Yalnız PDF gönderen (OLG Köln 11 U 118/20) ve PDF'i eksik bırakan (OLG Düsseldorf Verg 54/21) teklifler elendi. X84, gelen X83'ün yapısına birebir oturmak zorunda. Sayfa "teklif şu dosya üzerinden döner" demeli.</li>
    <li><b>Bağlayıcı metin.</b> VHB 212: idarenin uzun metinli LV'si tek bağlayıcıdır. "PDF GAEB'i ezer" diye genel bir kural bulunamadı; her ihalenin şartnamesi belirler. Bu yüzden fark çıkınca uygulama karar vermez, sorar.</li>
    <li><b>Sürüm.</b> İdare ihale süresince yeni LV yükler; eski sürümle teklif veren elendi (VK Bund VK 2-54/18). Sürüm formattan ayrı bir eksen: aynı ihalenin zaman içindeki hâlleri. Bu maketlerde yok, modelde yeri ayrıldı.</li>
    <li><b>GAEB dışında kalanlar.</b> Formlar, Baubeschreibung, planlar hep PDF. Tek görünüm LV'yi birleştirir; paketin geri kalanı belge olarak durur.</li>
  </ul>
  <p style="margin-top:10px"><b>Senin cümlene düzeltme:</b> "belgeler arası fark yalnız soru sormak içindir" dar. Farklar soru sebebi, evet; ama aynı zamanda elenme riski (yanlış sürüm, yanlış biçim). Sayfada üç ayrı şey olarak durmalı: fark (soru), sürüm (yeni hâl), dönüş biçimi (teklif).</p>

  <h2>Estimator ihaleyi açınca ne yapar</h2>
  <p>IHK/ABST kontrol listesi ve bauprofessor'a göre sıra: paket tam mı → her şeyi oku → teklif verilecek mi → soruları hemen sor → tarihleri planla → kendi işi ile taşeron işini ayır → miktarları kontrol et → fiyatla → biçim kontrolü → teslim. İlk bakışta görmek istediği: teklif tarihi, soru son günü, bağlayıcılık süresi, iş süresi; kapsam ve işler; paket tam mı; hangi sürüm; hangi biçimde dönecek.</p>
  <p style="margin-top:8px">ORCA ve iTWO'nun ortak kalıbı: solda yapı ağacı (proje → LV → Los → başlık), ortada pozisyon tablosu, uzun metin ayrı bir alanda, pozisyon türü ikon ya da sütun, tarihler LV'nin kapak verisi.</p>

  <h2>Üç seçeneğin ortak modeli</h2>
  <ul>
    <li><b>Sayfa ihaleyi gösterir, dosyayı değil.</b> Bugünkü "THIS LV AS: tender GAEB XML · tender package PDF · bid GAEB 90…" çubuğu kalkar. Aynı LV'nin belgeleri okunur ve birleştirilir: yapı, miktar ve birim GAEB'den; sayfalar ve fazla ön açıklamalar PDF'ten.</li>
    <li><b>Aşama bir dosya değil, ihalenin durduğu yer:</b> Tender · Check · Questions · Prices · Bid · Award. Yüklenen bir teklif ya da sipariş dosyası aynı pozisyonların üstüne fiyat sütunu olarak gelir, ayrı sayfa olarak değil.</li>
    <li><b>Kaynak tek tık uzakta:</b> her pozisyonda hangi belge, hangi sayfa; "Documents" her belgenin ne verdiğini ve teklifin neyle döneceğini söyler.</li>
    <li><b>Fark = müşteriye soru adayı</b> ("Draft a bidder question"), uygulama hangisinin doğru olduğuna karar vermez.</li>
    <li><b>Çok LV:</b> ihale → LV → bölüm → pozisyon; tek LV'de bir seviye eksik, aynı ekran.</li>
    <li>Kontroller (Stop / Caution / Note) bu maketlerde bilerek yok: sıradaki aşama. Aynı şeritlerin üstüne renkleriyle gelecekler.</li>
  </ul>

  <h2>Seçenekler</h2>
  <table class="opts"><thead><tr><th>Seçenek</th><th>Tez</th><th>Güçlü</th><th>Zayıf</th></tr></thead><tbody>
  <tr><td>A · Register</td><td>Ağaç, tablo, pozisyon föyü. ORCA ve iTWO'nun kalıbı.</td><td>Estimator'ın bildiği ekran; 1.000+ pozisyonda en hızlı arama; çok LV doğal (ağaçta bir seviye).</td><td>Jüri için en az görsel; "nerede" yerine "ne" önde, ürün ilkesi 1 zayıflar.</td></tr>
  <tr><td>B · Cover sheet + map</td><td>Solda ihalenin kapak sayfası, ortada LV haritası. Çok LV'de aynı harita bir seviye yukarıdan.</td><td>Mevcut imza (şerit) korunur; kontroller gelince aynı yerde ayağa kalkar; projektörde okunur; tarihler hep görünür.</td><td>Okumak için değil, bakmak için: metne ulaşmak bir tık; 27 LV × şerit uzun bir sayfa.</td></tr>
  <tr><td>C · Reader</td><td>İhale, tek sütun kâğıt gibi baştan sona okunur; notlar kenarda.</td><td>İş akışının 2. adımı "her şeyi oku" için tek doğru ekran; farklar ve türler metnin yanında; kaynak belge hissi kalır.</td><td>Genel bakış zayıf; büyük LV'de uzun; fiyatlama için tabloya yine ihtiyaç var.</td></tr>
  </tbody></table>
  <p style="margin-top:12px"><b>Önerim: B'yi ana ekran yap, C'yi onun "Read" görünümü olarak ekle, A'nın tablosu "Items" görünümü olarak kalsın.</b> Gerekçe: B ürünün ilkesini (önce nerede, sonra ne) ve mevcut tasarım dilini taşıyor, sıradaki aşamalar (kontroller, sorular, fiyatlar) aynı şeride oturuyor; kapak sayfası araştırmanın "ilk bakışta" listesini karşılıyor. C tek başına ana ekran olamaz ama okuma adımını bugün hiçbir görünüm karşılamıyor. A tek başına seçilirse ORCA'nın kopyası oluruz.</p>

  <h2>Kaynaklar</h2>
  <p><small>
  <a href="https://www.mobilitaet.bayern.de/assets/stmi/buw/bauthemen/vergabeundvertragswesen/vhf/vi-6_zvb-dvanwendung1018a_bearb.pdf">VHF Bayern VI.6</a> ·
  <a href="https://www.deutsche-rentenversicherung-bund.de/einkaufskoordination/NetServer/download/VHB_212_Teilnahmebedingungen_2019.pdf">VHB 212</a> ·
  <a href="https://www.heuking.de/de/news-events/newsletter-fachbeitraege/artikel/pdf-lv-fehlt-ausschluss-keine-nachforderung.html">OLG Düsseldorf Verg 54/21</a> ·
  <a href="https://www.heuking.de/de/news-events/newsletter-fachbeitraege/artikel/leistungsverzeichnisse-nur-im-geforderten-dateiformat.html">OLG Köln 11 U 118/20</a> ·
  <a href="https://bi-medien.de/vergabe-wissen/news/bieter-verwendet-alte-version-der-vergabeunterlagen-angebotsausschluss">VK Bund VK 2-54/18</a> ·
  <a href="https://www.kpluss.com/.downloads/suppliers/leitfaden-datenaustausch-im-ava-prozess-v2.0.pdf">K+S Leitfaden</a> ·
  <a href="https://www.submission.de/pdf/Bieter-Checkliste-Angebotsabgabe.pdf">IHK/ABST Bieter-Checkliste</a> ·
  <a href="http://www.baulinks.de/bkd_file/orca-software/ORCA_AVA_26_Startklar_in_10_Minuten_20250221.pdf">ORCA AVA 26</a> ·
  <a href="https://www.hirschs.de/Handreichungen/iTwo.pdf">iTWO Erste Schritte</a> ·
  <a href="https://www.mwm.de/aktuelles/uebersicht/blog/gaeb-dateien-pruefen-haeufige-fehler-beim-datenaustausch">MWM</a> ·
  <a href="https://dangl-it.com/articles/the-gaeb-data-formats-in-detail">Dangl</a> ·
  <a href="https://www.weka.de/architekten-ingenieure/gaeb-schnittstelle/">WEKA</a>.
  Bulunamayanlar: PDF ile GAEB arasında genel öncelik kuralı; farkların sahada ne sıklıkta çıktığı; format paylarının güncel rakamı. Maketlerdeki tarihler örnektir: veri setindeki dosyalar tarih taşımıyor.</small></p>
  </div></div>`;
}

// ---- render and events ----
const app = document.getElementById("app");
function render(keep = true) {
  const sc = keep ? [...app.querySelectorAll(".scroll")].map((e) => e.scrollTop) : [];
  location.hash = `${S.opt}/${S.proj}`;
  for (const b of document.querySelectorAll("#pg-opt button")) b.setAttribute("aria-selected", b.dataset.v === S.opt);
  for (const b of document.querySelectorAll("#pg-proj button")) b.setAttribute("aria-selected", b.dataset.v === S.proj);
  document.getElementById("pg-note").textContent = S.opt === "research" ? "" : "Real LV data from the dataset. Dates are examples.";
  app.innerHTML = S.opt === "research" ? research() : band() + stages() + (S.opt === "a" ? viewA() : S.opt === "b" ? viewB() : viewC()) + (S.drawer ? drawer() : "");
  if (keep) app.querySelectorAll(".scroll").forEach((e, i) => (e.scrollTop = sc[i] ?? 0));
}
const reset = () => Object.assign(S, { lv: null, sec: null, item: null, drawer: false, q: "", marked: false, remarks: false });

document.querySelector(".pg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.parentElement.id === "pg-opt") S.opt = b.dataset.v;
  else S.proj = b.dataset.v;
  reset();
  render(false);
});
app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "drawer-close" && e.target.closest(".drawer") && !e.target.closest("button")) return;
  let keep = true;
  if (act === "item") {
    S.item = { lv: el.dataset.lv, oz: el.dataset.oz };
    if (S.drawer) {
      S.drawer = false;
      if (S.opt === "a") (S.sec = null), (S.remarks = false);
    }
  } else if (act === "item-close") S.item = null;
  else if (act === "lv") (S.lv = el.dataset.lv || null), (S.sec = null), (S.remarks = false), (S.item = S.opt === "c" ? null : S.item), (keep = S.opt === "a");
  else if (act === "sec") (S.sec = el.dataset.sec), (S.remarks = false);
  else if (act === "remarks") (S.remarks = true), (S.sec = null);
  else if (act === "marked") S.marked = !S.marked;
  else if (act === "drawer") S.drawer = true;
  else if (act === "drawer-close") S.drawer = false;
  else if (act === "ask") S.asked.add(el.dataset.id);
  else if (act === "goto") return void document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: "smooth", block: "start" });
  e.stopPropagation();
  render(keep);
  if (act === "item" && S.opt === "c") document.getElementById("p" + S.item.oz)?.scrollIntoView({ block: "nearest" });
  if (act === "lv" && S.opt !== "a") app.querySelector(S.opt === "c" ? "#paper" : ".b .main .scroll")?.scrollTo(0, 0);
});
app.addEventListener("input", (e) => {
  if (e.target.id !== "q") return;
  S.q = e.target.value;
  const at = e.target.selectionStart;
  render();
  const q = document.getElementById("q");
  q.focus();
  q.setSelectionRange(at, at);
});
app.addEventListener("mouseover", (e) => {
  const m = e.target.closest(".b .strip [data-oz]");
  const r = document.getElementById("readout");
  if (!m || !r) return;
  const it = T().lvs.find((l) => l.id === m.dataset.lv)?.items.find((i) => i.oz === m.dataset.oz);
  if (it) r.innerHTML = `<b>${it.oz}</b><span lang="de">${tok(it.short)}</span>&nbsp;· ${qty(it.qty)} ${esc(it.unit)}${it.kind !== "normal" ? " · " + KIND[it.kind][1] : ""}${it.diff ? " · the documents differ" : ""}`;
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (S.drawer) S.drawer = false;
  else if (S.item) S.item = null;
  else return;
  render();
});
render(false);
