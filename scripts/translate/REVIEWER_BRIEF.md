# Brief for reviewing one batch of translations (German → English)

German construction tender documents (bills of quantities, contract forms) were translated into English as a reading
aid for someone who knows no German. The owner's requirement: **nothing may be lost in translation.** You did not
translate this batch. You read every German segment next to its English and report where the English does not carry
everything the German says.

## Files

- Input: `data/processed/translation/review/<batch>.json` — a list of `{"id", "de", "en", …}` in document order.
  `de` and `en` have the same shape: a string, or a list of strings with one entry per text node of the source file
  (a sentence may run over several entries; judge the list as a whole, but the number of entries is fixed).
  `context_only` is neighbouring text for understanding, not part of the segment.
  `automatic_check_noticed` lists what a script found odd in this pair (often a false alarm, sometimes not).
- Rules the translation had to follow: `scripts/translate/TRANSLATOR_BRIEF.md` (read the "Fidelity rules") and
  `dataset/en/GLOSSARY.md`.
- Output: write `data/processed/translation/review_out/<batch>.json` — a JSON list with one entry per **defective**
  pair: `{"id", "problem", "fixed_en"}`. `problem` says in one sentence what is missing or wrong, quoting the German.
  `fixed_en` is the complete corrected English for that segment, in the same shape as `en` (same number of list
  entries). An empty list `[]` is a valid result.
- Check: `uv run python scripts/translate/review.py check <batch>` from the repo root. Fix what it rejects and run
  it again.

Read the whole batch, pair by pair, yourself. Do not write a script that judges the pairs.

## What counts as a defect (report it)

1. **Omission**: a word, phrase, clause, sentence, list entry, bracket, condition, exception, qualifier
   ("mind.", "max.", "ca.", "nur", "nicht", "ohne", "einschl.", "jeweils", "bauseits" …), reference ("gem.
   Pos. …", "siehe …") or remark that is in the German and not in the English. This is the main thing to look for.
2. **Addition**: something in the English that the German does not say, including explanations and resolved
   ambiguity.
3. **Wrong meaning**: negation lost or added, who has to do or pay what (AG vs AN) swapped, "liefern" vs
   "einbauen" confused, a wrong technical term that changes what is to be built.
4. **Changed value**: a number, unit, DN / PN, dimension, standard, product or article code, date or
   anonymisation token (`[FIRMA_044]`, `[PERSON_167]` …) that differs from the German.
5. **A source error that was repaired**: the German contradicts itself, has a wrong value, a typo, a broken or
   cut-off sentence, and the English silently fixes it. The English must show the same defect (a misspelled German
   word gets a comparable English misspelling). Restore the defect in `fixed_en`.
6. **German left over** that is not a name, code, unit or token.

## What is not a defect (do not report it)

- Style, word choice, word order, a different but correct term, British vs American spelling.
- Line breaks inside a string segment that were joined or kept differently, as long as no text is lost.
- Text distributed differently over the entries of a list, as long as the list as a whole carries everything.
- Terms rendered as the glossary says, even if you would prefer another term.
- Names, codes, units, tokens and standards left in German or verbatim: that is required.
- Dimension letters (B, H, T, L, D) and code abbreviations (AG, AN, EP, GP, LV, OZ) kept as they are.

Be strict about content and silent about style. If a pair is fine, it does not appear in your output. Do not report
a pair just because `automatic_check_noticed` has an entry; look, and report only if something really is missing or
changed.

## Rules for `fixed_en`

Change only what is needed to repair the defect; keep the rest of the existing English. Numbers, tokens and codes
exactly as in the German (German number format). Same number of list entries. Respect `max_chars`.

## Final message

Four lines: the batch name; the result line of `review.py check`; the number of pairs you read; a one-line summary of
the kinds of defects found (or "none").
