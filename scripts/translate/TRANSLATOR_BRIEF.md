# Brief for translating one batch (German → English)

You translate one batch of text segments taken from German construction tender documents (bills of quantities,
"Leistungsverzeichnis", and contract forms). The English version is a reading aid for a non-German speaker who wants
to see **exactly what the original says**. The originals contain deliberate and accidental errors that a checking
tool is meant to find. If you repair one, the English copy becomes useless.

## Files

- Input: `data/processed/translation/batches/<batch>.json` — a list of `{"id", "src", …}` in document order
  (neighbouring segments usually belong to the same item or page, use them as context).
- Glossary: `dataset/en/GLOSSARY.md` — read it first and use its renderings throughout.
- Output: write `data/processed/translation/out/<batch>.json` — one JSON object `{"<id>": <english>, …}` with every
  id of the input.
- Notes: write `data/processed/translation/notes/<batch>.json` — a JSON list of
  `{"id", "german", "english", "note"}` for every error, typo, contradiction or oddity you notice in the source
  (see "What to record"). An empty list `[]` is fine.
- Check: run `uv run python scripts/translate/check_batch.py <batch>` from the repo root, fix what it reports, and
  run it again until every segment passes or you are sure a remaining report is a false alarm (say which and why in
  your final message).

Work through the whole batch yourself, segment by segment. Do not write a script that translates, and do not use any
translation service or API. Write the output file in several steps if that is easier (for example build it up with a
few Write/Edit calls), but the final file must be one valid JSON object.

## Shape of a segment

- `src` is a **string**: return a string. `\n` marks where a printed line ended. Re-flow the text freely: join lines
  that are only wrapped sentences, and keep a `\n` only where the break is structural (list entries, label / value
  lines, a heading followed by text, table rows). If a line was cut off in the source in the middle of a word
  (the text simply stops, e.g. `…ist die Aufnah`), keep the cut: translate what is there and end with a correspondingly
  cut-off word, and keep that line break.
- `src` is a **list of strings**: return a list with **exactly the same number of entries**, entry by entry. Each
  entry is one text node of the original file. A sentence may run over several entries; spread the English sentence
  over the same entries in a natural way. An entry that has no words to translate (a number, a unit, a token) is
  returned unchanged. Never merge, split, add or drop entries.
- `max_chars`: the English must not be longer than this many characters (fixed-width field). Abbreviate sensibly if
  needed.
- `context_only`: text before / after the segment (it continues across a page break). It is there to understand
  the sentence. Do not translate it into the output.
- `previous_attempt_rejected_because`: an earlier translation of this segment failed the checks for this reason.

## Fidelity rules

1. **Never correct, harmonise, complete or improve anything.** Wrong values stay wrong, contradictions stay
   contradictions (short text "DN 125", long text "DN 100" → both stay), copy-paste leftovers stay, ambiguity stays
   ambiguous ("ca.", "nach Wahl des AG" are not resolved or explained).
2. **Copy verbatim**: every number, item number (OZ), quantity, price, date, DN / PN value, dimension, standard
   (DIN, EN, ISO, VOB, ATV, ZTV, DVGW …), article / product code, product and company name, street name, e-mail,
   URL. Keep the German number format (`139,7`, `1.451,00`, `0,50 m`). Do not convert units, do not write numbers as
   words or words as numbers, do not add or remove a digit anywhere (the check compares all digit groups).
3. **Unit codes stay verbatim** (`St`, `Stk`, `psch`, `m³`, `m2`, `lfm`, `Mt`, `StWo`, `Std`, `h` …). Where the text
   explains a unit (`St   Stück`), translate only the explanation (`St   piece`) and keep the spacing.
4. **Anonymisation tokens stay byte-identical**: `[FIRMA_044]`, `[ORT_016]`, `TELEFON_084`, `[PERSON_167]`,
   `[PROJEKT_000000002]`, `[BILD_001]` and so on (with or without brackets, zero-padded variants exist). The
   anonymiser also replaced product names, standards and ordinary words, so a token can sit in the middle of a
   sentence (`VOB [ORT_016] C`, `[PERSON_010] Beschädigungen`). Leave it where it belongs in the sentence and do not
   guess what it stood for.
5. **Misspelled German words**: render the meaning with a comparable misspelling in English ("Stahlbetonfertigeile"
   → "precast concrete elemnts", "Entferrnung" → "disstance"). Record every case in the notes file.
6. **Abbreviations used as codes stay**: AG, AN, EP, GP, LV, OZ, DN, PN, NU, OK, UK, GOK, NN. Ordinary German
   abbreviations are translated (`einschl.` → `incl.`, `ca.` → `approx.`, `bzw.` → `or`, `z. B.` → `e.g.`,
   `gem.` → `acc. to`, `o. glw.` → `or equivalent`, `i. M.` → `on average`, `lfd.` → `running`).
   `AG` / `IG` next to a thread size mean external / internal thread (Außen- / Innengewinde), not the client:
   translate those by meaning (`1/2-Zoll AG` → `1/2-inch external thread`).
   Single-letter dimension symbols stay as in the source (`B`, `H`, `T`, `L`, `D`, `d`, `b`, `h`, `t`, `s`, `U`:
   `B 1,20 m` stays `B 1,20 m`, `T 150cm` stays `T 150cm`); the glossary explains them.
7. **Fill-in fields** (`'.........'`, `........`, `____`) and markup-like fragments (`[TA11 … ]`, `***`) stay as
   they are; translate only the words inside them.
8. **Use the glossary.** Terms that are not in it: use the ordinary English construction term and stay consistent
   inside the batch. Compound nouns are translated, not left in German. Section headings, labels, form text and
   boilerplate are translated too. Nothing German may remain except names, tokens, codes and units.
9. Keep the register: terse specification language, no added articles of explanation, no translator's remarks, no
   brackets with the German original.
10. Punctuation: keep dashes (`–`, `-`), bullets and symbols (`³`, `²`, `°`, `§`, `Ø`, `%`, `±`, `®`) as in the
    source. German quotation marks `„…“` become straight quotes `"…"`. Do not introduce umlauts.

## What to record in the notes file

Only things in the **source**: misspellings and how you rendered them; values that contradict each other inside a
segment or against a neighbouring segment (e.g. short text vs long text); obvious copy-paste leftovers; sentences
that break off or are cut; words replaced by an anonymisation token in a way that damages the sentence (one note per
batch for a recurring pattern is enough); anything else odd. Quote the German and your English. You only record
these, you never fix them.

## Final message

Reply with three lines: the batch name, the result line of `check_batch.py`, and the number of notes written.
