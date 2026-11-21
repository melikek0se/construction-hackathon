---
name: LV Check
description: A German bill of quantities checked item by item; yellow and white, industrial, small and square, with the trouble standing up in place.
colors:
  signal-yellow: "#ffc400"
  yellow-ink: "#3a2c00"
  strip-yellow: "#f2b600"
  ink: "#121413"
  ink-2: "#3b403a"
  tag-ink: "#3f433d"
  mute: "#5f635c"
  dim: "#8b8e87"
  stop-red: "#c4161c"
  note-blue: "#0a5aa8"
  ground: "#ffffff"
  tint: "#f6f6f2"
  hover: "#fff7cf"
  rule: "#e3e3dd"
  line-2: "#c4c4bc"
  strip-base: "#e9e9e4"
  strip-base-hover: "#eadb96"
typography:
  brand:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.025em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.04em"
  item-number:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.02em"
    fontFeature: "tnum"
  figure:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  index:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.1em"
  button:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.08em"
  tag:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: "0.08em"
rounded:
  none: "0"
  control: "2px"
spacing:
  mark-gap: "2px"
  chip-gap: "4px"
  card: "12px"
  gutter-mobile: "14px"
  panel: "16px"
  gutter: "20px"
  page: "28px"
components:
  band:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    height: "70px"
    padding: "4px 20px"
  button-primary:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal-yellow}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "30px"
    padding: "0 12px"
  button-outline:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "30px"
    padding: "0 12px"
  button-outline-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
  button-ghost-hover:
    backgroundColor: "{colors.signal-yellow}"
  input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "30px"
    padding: "0 9px"
  file-chip:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "24px"
    padding: "0 8px"
  file-chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  view-switch-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    height: "28px"
    padding: "0 11px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.tag-ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.none}"
    padding: "0 5px"
  index-plate:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.index}"
    rounded: "{rounded.none}"
    size: "30px"
  index-plate-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal-yellow}"
  finding-card:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px"
  quoted-lv-text:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  readout:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "32px"
    padding: "0 10px"
---

# Design System: LV Check

Recorded from the build on 2026-11-21 (`web/src/styles.css`, last matching rule; the React components in
`web/src/`). It replaces the earlier "site signage" document; the direction is D-020 in `docs/DECISIONS.md`.

## Overview

**Creative North Star: "The Site Register"**

The team's brief, binding: keep the yellow tone and the "under construction" image; yellow and white;
industrial but modern; nothing round, nothing soft, nothing huge. The build answers with a white sheet under
one yellow band. The band, 70px high with one black-and-yellow hazard stripe, 18px, along its lower edge and a
tower-crane mark as the logo, is the one piece of site on every page. Everything below it is a register: hairline
rules, square corners, 12 to 15px text, small tracked capitals for labels, tabular figures.

The product principle "where before what" is carried by one device used at two scales. An LV is drawn as a
strip of its items in LV order; an item without a finding is a pale grey mark, an item with a finding stands up
in its severity colour. On the projects page the strip is 22px high and anonymous (the fingerprint); in the
workspace it becomes the LV map, where flagged items carry their item number. Severity is always shape plus
colour: Stop is a red circle, Caution a yellow triangle, Note a blue square.

Rejected by the team and not to return: all-yellow pages with heavy black keylines (tiring), the same language
made softer with rounded cards and a large headline, and a dark version.

**Key Characteristics:**
- White ground, one yellow band; yellow below the band only for the primary action, index plates, a caution mark and hover.
- Hairlines (1px) do the dividing; cards are an outline, never a fill and a shadow.
- Square: containers and marks have no radius, controls have 2px.
- Small type: body 14px, labels 11px capitals, the largest text on any page is the 30px item number.
- The LV as a strip of items with trouble standing up in place, on the projects page and in the workspace.
- Three severity signs, shape and colour together, unchanged across every view.

## Colors

Yellow and white with near-black ink; red and blue appear only as severity.

### Primary
- **Signal Yellow** (`signal-yellow`): the band; the one primary action of a view (New project, Run AI review);
  index plates (project letter, section number); Caution blocks in the LV map and the Caution triangle;
  `mark` highlight on quoted text; text selection; the intake panel's header.
- **Yellow Ink** (`yellow-ink`): secondary text on yellow (the file line in the band, the intake header).
- **Strip Yellow** (`strip-yellow`): the Caution mark in the fingerprint strip. Slightly deeper than the band
  yellow because a 3px line on white has no black keyline to hold it.

### Secondary
- **Stop Red** (`stop-red`): Stop sign, Stop blocks and strip marks, error notices, a broken term or a missing
  item in a finding picture, an unfavourable difference in what-if.
- **Note Blue** (`note-blue`): Note sign, Note blocks and strip marks.

### Neutral
- **Ink** (`ink`): text, the selected state of chips and switches, the top rule of a table, the secondary dark button.
- **Ink 2** (`ink-2`), **Tag Ink** (`tag-ink`): quieter running text; text of outlined tags.
- **Mute** (`mute`): secondary text (sub-lines, reasons, captions under pictures).
- **Dim** (`dim`): labels in capitals, "no file", check ids, sources.
- **Ground** (`ground`): page, panels, cards, table heads. There is one white.
- **Tint** (`tint`): quoted LV text, the readout bar, the AI-review bar.
- **Hover** (`hover`): pale yellow under a hovered row, the selected table row, the changed cell in what-if.
- **Rule** (`rule`): hairlines between rows and inside cards; unflagged item marks in the LV map.
- **Line 2** (`line-2`): outlines of controls, chips, tags and cards.
- **Strip Base** (`strip-base`, `strip-base-hover`): the resting bar of a fingerprint strip, and its tone when the row is hovered.

### Named Rules
**The One Band Rule.** A full-width yellow surface exists once per page: the band. Below it yellow is a small
plate, a button or a mark, never a section background.

**The Severity Only Rule.** Red and blue mean Stop and Note (red also: an error or a loss). They are never used
for decoration, links or branding.

**The Hover Is Yellow Rule.** Hover lightens to pale yellow on rows, and inverts yellow plates and the primary
button to ink with yellow text. Selection is ink with white text.

## Typography

**Display Font:** Barlow Condensed 600/700 (with Arial Narrow, sans-serif), self-hosted via @fontsource
**Body Font:** Barlow 400/500/600/700 (with system-ui, sans-serif), self-hosted via @fontsource

**Character:** One family in two widths. Barlow carries everything that is read; the condensed cut is kept for
a handful of numerals and headings where a figure has to be picked out of a row.

### Hierarchy
- **Brand** (Barlow Condensed 700, 24px, 0.025em, uppercase): "LV CHECK" in the band, beside the crane mark.
- **Headline** (Barlow Condensed 600, 22 to 24px, line-height 1, uppercase): the verdict counts of an LV
  ("2 STOPS 10 CAUTIONS 8 NOTES", 22px, 0.04em) and the page title of the projects page (24px, 0.08em).
- **Item number** (Barlow Condensed 600, 30px, 0.02em, tabular): the Ordnungszahl at the top of the item sheet.
  The largest text in the product.
- **Figure** (Barlow Condensed 600, 24px, tabular): a price from past bids, the totals in what-if, the
  dimension inside a finding picture (20px).
- **Index** (Barlow Condensed 600, 17 to 18px): the letter or number on a yellow index plate.
- **Title** (Barlow 600, 14.5 to 16px, line-height 1.25 to 1.3): project name, section title in the map,
  item title in the sheet, title of a finding.
- **Body** (Barlow 400, 14px, line-height 1.45): base text. 13.5px inside cards, tables and quoted LV text.
- **Body small** (Barlow 400, 12 to 13px): sub-lines, reasons, captions, chips, sources (11.5px).
- **Label** (Barlow 600, 11px, 0.1em, uppercase, `dim`): column heads, card field names ("Why it matters"),
  map key, counts in a panel head. One voice for every label.
- **Button** (Barlow 700, 12px, 0.08em, uppercase): buttons, the back link, panel heads and card heads
  (0.1em), step names on the projects page (11px).
- **Tag** (Barlow 600, 10.5px, 0.08em, uppercase): outlined tags and the format word in a version button.

### Named Rules
**The Nothing Huge Rule.** 30px is the ceiling, and only the item number reaches it. A page title is 24px.

**The Condensed For Figures Rule.** Barlow Condensed appears only on the brand, the two headlines, index
plates, the item number and money or dimension figures. Buttons, labels, tags, table cells and item numbers in
lists and blocks are Barlow.

**The Tabular Rule.** Every item number, count, quantity and amount is set with tabular figures.

**The German Stays German Rule.** LV text is shown as written and marked `lang="de"`; anonymisation tokens are
shown in quieter ink with a dotted underline, never styled as errors.

## Layout

Every page is a column: band, an optional bar, then the content filling the height.

- **Projects page.** Content is centred with a maximum width of 1320px and at least 28px at the sides. A head
  line (title and the next date left, drop hint and the primary button right), then two parts, each under a
  2px ink rule with a label-style heading. **Schedule:** one row per running tender on a grid of 380px (index
  plate, name, its two dates as fields) and a time axis of eight weeks (two back, six ahead) with a hairline per
  week, tinted weekends and an ink line for today. **Board:** five columns (Check, Questions, Pricing,
  Submitted, Award) divided by hairlines, one outlined card per tender. The schedule holds dates and nothing
  else, the board holds everything but dates (D-029).
- **Workspace.** Under the band a bar with the versions of the LV, then two panes: the left pane takes the
  remaining width, the right pane is `clamp(360px, 32vw, 520px)` with a hairline on its left. Left: the verdict
  and the view switch (LV map, Item table, Remarks, What-if), the view, and the readout bar at the bottom of
  the map. Right: the findings list, replaced by the item sheet when an item is open. Gutter 20px on the left
  pane, 16px in the right pane, 12px inside a card.
- **Project view.** Same two panes: the trade diagram left, findings between the LVs right.
- **Rhythm.** Dense and even: rows are separated by a hairline and 6 to 14px of padding, marks in a strip are
  2px apart, chips 4px apart. A new sub-section in the LV map starts after a 7px gap.
- **Narrow (up to 900px).** Gutters drop to 14px; the register row becomes index plate plus one stacked
  column, column heads are hidden, the strip takes the full width under its chips; the workspace panes stack
  and scroll as one page; band actions wrap.
- **901 to 1280px.** The register columns tighten (project 150 to 200px, chips column 150px) so the strip keeps
  a readable width.
- **Large displays.** The whole interface is scaled, not re-laid-out: `body { zoom: 1.15 }` from 1700px wide
  and `zoom: 1.4` from 2300px. This is how the UI stays readable on a projector without large type.

## Elevation & Depth

Flat. There are no shadows and no layers; depth is not a device here. `box-shadow` appears only as a drawn
line: a 1px inset ink outline on the white buttons in the band, a 1px ink rule under a table head, and a 2px
ink ring around a hovered block in the LV map. The one perspective drawing is the trade diagram.

### Named Rules
**The Line Not Lift Rule.** State is shown by a line or a fill changing colour (120ms), never by a shadow, a
blur or a movement.

## Shapes

Square. Containers and marks have no radius: cards, tags, index plates, strip marks, map blocks, quoted text,
the readout, the intake panel. Controls have 2px: buttons, inputs, selects, file chips, version buttons, the
view switch, severity toggles, item links.

Lines come in three weights: 1px `rule` between rows and inside cards; 1px `line-2` around controls and cards;
ink for emphasis (1px under a table head and on a hovered or selected control, 2px on top of the register
table and around the intake panel).

The hazard stripe is the only pattern: black and yellow at 45 degrees, 9px per band, 9px high, drawn along both
edges of the band and of every tape. It also runs across a card whose files are being read, under a notice while a file is being read and along the ground edge in
the trade diagram.

**The Round Belongs To The Signs Rule.** The circle and the rounded square exist as severity signs, and a
circle may be drawn where the subject itself is round (a pipe bore in a finding picture). No interface
container, button or badge is round or pill-shaped.

## Components

### Band
The site, once per page: signal yellow, at least 70px high, one hazard stripe along its lower edge, 18px,
twice the height of the stripe on the tapes; nothing along the top. It carries no lettering beyond the brand:
words running along it were tried and read as buttons, a stripe along both edges was tried and dropped. Left: the crane mark (a 24px line drawing in ink, 1.8px square-ended strokes) and "LV CHECK" in the
brand style; in the workspace the brand is the way back to the projects. Then the open project (15px, 600) over
a file line (12.5px, yellow ink); a created project's name is an input that shows its frame only on hover and
focus. Right: actions. On the projects page the one action is the Schedule switch: outline with the count of running
tenders on a yellow chip, ink while the schedule is open; absent while there is no project.

### Buttons
- **Shape:** 2px radius, 30 to 32px high, 12px side padding, Barlow 700 12px capitals with 0.08em tracking.
- **Primary** (New project, Run AI review): yellow with ink text; hover inverts to ink with yellow text. One per view.
- **Ink** (All projects in the band): ink with white text.
- **Outline in the band** (Risk report, Bidder questions): white with a 1px inset ink line; hover ink with white text.
- **Ghost** (Cancel, Add files): transparent with a `line-2` outline; hover yellow with an ink outline. "Add files" is the small size, 26px high, 10.5px.
- **Back link** in the item sheet: a chevron and capitals, no outline; hover pale yellow.
- **Text link:** 600, 1px underline with 3px offset.
- **Focus:** 2px ink outline, 2px offset, everywhere.
- Colour transitions are 120ms with `cubic-bezier(0.16, 1, 0.3, 1)`; `prefers-reduced-motion` removes all transitions.
- The larger motions are the loading tapes (520ms pull-in, then a steady run along the tape) and the opening
  of the app: full yellow with two tapes while the projects are fetched, then each tape runs on through on its
  diagonal (in from a bottom corner, out at the opposite top corner, 600ms), the yellow rolls up like a roller shutter (820ms: plain yellow, the
  band's hazard stripe along its top and its foot, the brand on it where the band has it) and stops as the
  band itself, and the schedule rows are un-taped one after the
  other.

### Chips, tags and toggles
- **File chip** (projects page) and **version button** (workspace bar): 24px high, white with a `line-2`
  outline, 12px; the format word in bold, a qualifier ("package", "as submitted") in lighter small text. Hover:
  ink outline. Selected: ink with white text. One file per step is selected and the strip shows that file.
- **Tag:** outline only (`line-2`), no radius, 10.5px capitals, `tag-ink`. Used for trade and format words.
- **Source chip** ("00 Roh und Erdauarbeiten, 3 cautions"): 22px high, outlined, 600; hover yellow with an ink outline.
- **Severity toggle** (findings filter): 28px high, outlined, sign, name and count; switched off it keeps only a `rule` outline.
- **Section chip** (active section filter): pale yellow with an ink outline.
- **Item link** inside a finding: outlined item number, 12px 700; hover pale yellow with an ink outline.

### Inputs
White, `line-2` outline, 2px radius, 30px high (32px in the intake panel), 13 to 14px text. Focus: the outline
turns ink; in the intake panel a 2px yellow outline is added. A field label is the label style above the field.

### Select and date field
Drawn by us (`web/src/controls.tsx`, `controls.css`), never by the browser: no native `<select>` and no
`type="date"`. The field is an input-shaped button (same outline, radius and heights) with a square-ended
chevron or a calendar sign at the right. Its panel opens under it (above when there is no room), white with a
1px ink outline, no radius, no shadow. **Select:** rows 28px with hairlines between, pale yellow under the
pointer or the arrow keys, the chosen entry ink with white text. **Date:** written "Fri 27.11.2026"; the
calendar is one month, Monday first, with the calendar week (KW) in a ruled column, weekends on tint, today
with a 2px ink line under the number, the chosen day ink with white text, days past a limit struck through;
foot on tint with Today and Clear. Keyboard: arrows, Home/End, PageUp/PageDown for the month, typing to jump
in a select, Esc closes. A checkbox is a 15px square that fills ink with a white tick; a number field has no
spinner; the clear cross of a search field is two ink strokes.

### View switch
Four segments in one `line-2` outline with hairlines between them, 28px high, 12px 600. Selected: ink with
white text. Hover on the others: pale yellow.

### Severity signs
One component (`Sign`), drawn on a 24-unit grid and used at 14 to 18px: Stop is a red disc with a white bar,
Caution a yellow triangle with an ink outline and exclamation mark, Note a blue square with a white "i". A
count always stands to the right of its sign; a zero count is shown faded (38%), not removed.

### Schedule row
The axis has two scales: eight weeks by the day, a hatched break (`line-2` hatching between two hairlines),
thirteen months by the month. A row is 68px: index plate, the tender's name (15px, 600) with its stage
beneath, the days left to the next date as a 30px figure (on a yellow plate within three days) and a square
button that lists its dates. On the lane: time left until submission is a 12px ink bar, time gone a 3px
`line-2` line, waiting for the client a 2px dashed line closed by a bracket, the work a 14px yellow bar with
an ink outline. A date's label is one line, the day (the next one in ink, 700); the mark says what it is:
a diamond on the bar for the question deadline, an ink flag for submission, an outlined flag for "bid sent".
Marks within three days are yellow with an ink outline. The days before today lie on `tint`. Above the rows,
the line of all tenders: 20px plates with the tender's letter (yellow = submission, outlined = questions),
stacked when they fall together, and 4px yellow bars for the work. Hover: pale yellow.

### Board card and fingerprint strip (signature)
A 1px `line-2` outline, white, 12px padding: index plate and name; the LV as a strip 22px high (a `strip-base`
bar with one vertical line per flagged item at its place in the LV, red and yellow 3px, blue 2px) with the
sign counts and the item count; what is open at this stage as a short list (a severity sign, or a 7px ink
square; a hollow square for "nothing open"); the net total in the figure style where a priced file exists;
the files behind a disclosure (open one, correct its step, add files, delete); for the first three stages a
stage select. Hover: ink outline, pale yellow. While its files are being read a card has a hazard tape
across it; the tape is wiped off to the right when the numbers arrive.

### New-project dialog
The one modal, drawn as a site sign: a white board with a 2px ink frame standing on two 14px ink posts that
run down out of the window, on a white veil. Its title (Barlow Condensed 700, 20px) stands on a yellow plate
at the left of the head, cut off on the slant with a hazard stripe along the cut, as the page-to-page gate
is cut; the rest of the head is white with a 2px ink rule under it. It is set up from below (520ms).
First a dashed drop zone; then two columns, the files with the step each belongs to (three-way
switch, the evidence beneath, a yellow "check" tag where the step was inferred) and what was read about the
tender with its source, plus the two dates no file carries. Footer (tint): a status line, Discard, the primary
button; while files are kept a hazard stripe runs along its upper edge. While files are dragged over the page
a pale-yellow veil with a 2px dashed ink border says "Drop to read the files".

### LV map (signature)
One row per section, hairline between rows: a yellow index plate with the section number, the title (14.5px,
600), on the right the section's sign counts, risk points and item count as labels. Under it the strip, 22px
high, indented 36px: an unflagged item is a 5px `rule`-coloured tick, a flagged item is a block in its severity
colour carrying its item number (12px 700; red and blue with white text, yellow with ink text; a Note block is
a bare square). Hover: tick turns ink, block gets a 2px ink ring. Selected: 2px ink outline at 2px offset;
items related to the open finding get a dashed outline. The key above the map uses the label style. The
readout below (32px, tint, hairline outline) names the item under the pointer.

### Findings list
Rows on a 16px sign, 62px item number, text grid; item number 13.5px 700, title 13.5px 600, the category
underneath in 12px `mute`; hairline between rows, pale yellow on hover. Above it the severity toggles, a search
field and category select, and the AI-review bar (tint) with the primary button.

### Item sheet and finding card
Breadcrumb (12px, `mute`), the item number in the item-number style, the title (16px, 600; the contradicted
words marked yellow), quantity and unit. Then one card per finding: a 1px `line-2` outline, no radius, white.
Its head is the sign, the kind of finding in capitals (12px 700, 0.1em) and the check id right-aligned in
`dim`; the head is white for every severity, the sign alone carries the colour. Body: the finding title
(14.5px, 600), the quoted evidence (13.5px, 500), a picture where one exists, then label and text pairs for why
it matters, what to do and money at stake. Below the cards: "Price from past bids" with the figure or
"No reliable price.", its sources, and the full LV text on tint.

### Pictures inside a finding
Plain line drawings in ink on white, ruled off like the evidence above them, at most 340px wide, with a
caption in 12.5px `mute` and labels in the label style. The forms in use: two sizes drawn to scale with a red
"not equal" between them; an equation of outlined terms with the wrong term outlined red; a sequence of
outlined plates joined by arrows, a missing one dashed red; horizontal bars 14px high on `rule` grey; a price
range with the past bids as dots. Red marks the one thing that is wrong, nothing else is coloured.

### Tables (item table, what-if)
Head cells in the label style on white with a 1px ink rule beneath; rows 6px by 10px, 13.5px, hairline
between; item number 700; numbers right-aligned and tabular. A section head row is 12.5px 700 with a `line-2`
rule. Hover and the selected row are pale yellow. In what-if only the difference cell of a changed row is pale
yellow; totals are in the figure style with labels above, the difference in red when the bid gets dearer, and
two 14px bars compare before and after.

### Notice
A bar under the band: red with white text, 13px 500, for an error and for the service not answering. It is not
used for loading.

### Loading tapes (signature)
While files are being read, and while the AI review runs, the page is veiled in white (78 %) and two barrier tapes are pulled across it, one
from each side, crossing a little off level (-5 and 4 degrees). A tape is 46px high: signal yellow, the hazard
stripe 9px along both edges, a 1px ink line outside. Along it runs what is being read, in Barlow Condensed
17px 600 capitals at 0.14em, the two tapes running in opposite directions. The tapes block the page until the
work is done and vanish without an exit. This is the one place where the stripe moves and where an animation
is more than a colour change; `prefers-reduced-motion` leaves the tapes in place, still.
During the AI review the tapes sit 90px higher and a board stands under them: a white plate with a 1px ink
border, 560px wide at most. It says what is being done at that moment: a heading in Barlow Condensed 17px
capitals with "n of m sections read" beside it, a 6px ink meter, the section being read, and the six kinds of
finding in two columns, each with its count so far (a count above zero on yellow). All six are looked for at
once in every section, so they are listed together and never as steps.

### Trade diagram (project view)
The one three-dimensional drawing (D-018): each trade LV is a lettered slab, standing one storey above the last
trade it builds on, so the order of work reads from the ground up ("Built first" to "Built later"). Trades with
no stated interface lie on a concrete ground slab in front, edged with the hazard stripe. A trade that expects
work no LV contains is red; a picked trade gets a yellow top. Dependencies are a faint grey web until a trade
is pointed at or picked, then only its arrows remain, solid and named on a yellow label. White background,
lettering in Barlow Condensed, the view turns about 57 degrees to either side. A tint readout below explains
how to read it.

## Do's and Don'ts

### Do:
- **Do** start every page with the band: yellow, 70px, one 18px hazard stripe below, crane mark and "LV CHECK" at the left.
- **Do** keep the ground white and divide with 1px lines (`rule` between rows, `line-2` around controls and cards).
- **Do** keep text between 12 and 15px, labels at 11px 600 capitals with 0.1em tracking, and figures tabular.
- **Do** show severity as sign plus colour: red circle, yellow triangle, blue square, with the count beside it.
- **Do** show an LV as a strip of its items in order, flagged items standing up in their severity colour, wherever an LV is summarised.
- **Do** give a view one yellow primary button; every other action is ink, outline, ghost or a text link.
- **Do** use pale yellow for hover and ink with white text for selection.
- **Do** scale for large screens with body zoom (1.15 from 1700px, 1.4 from 2300px) instead of larger type.
- **Do** say "no file", "no prices", "No reliable price." and "Not quantified" in plain words where there is nothing to show.

### Don't:
- **Don't** fill a page or a section with yellow, or frame sections with heavy black keylines; the team found both tiring.
- **Don't** round anything beyond 2px, and don't use pills, soft cards, shadows, gradients or blur: nothing round, nothing soft.
- **Don't** set anything larger than 30px: nothing huge.
- **Don't** colour the head of a finding card by severity; the head is white and the sign carries it.
- **Don't** use red or blue for anything but severity, errors and a loss.
- **Don't** use Barlow Condensed for buttons, labels, tags or table text.
- **Don't** add a dark version, a 3D picture of a single LV or an illustration; the trade diagram is the only 3D drawing.
- **Don't** translate or restyle German LV text, and don't mark anonymisation tokens as errors.
- **Don't** show an amount without its source, or imply money on a finding that has none.

## Not canonised / to clean up

- `web/src/styles.css` still opens with the signage-era rules (its first comment names the old world): 18 to
  40px condensed capitals for labels and buttons, 2 to 3px ink keylines, 40px controls, the ink readout,
  coloured card heads. The closing block overrides them property by property. They are debt, not system, and
  should be deleted rather than restated.
- `--plate`, `--ink-2` on headings and the hard-coded `#cdd0c7` and `#3b403a` in the price-source list are older
  values still referenced in places.

Cleaned up on 2026-11-21, so no longer in the build: radii above 2px (all 3 and 4px became 2px, all 8px became
0); "No reliable price." at 28px; the condensed 40px LV title of the project view; the 72px "Drop the LV"
overlay (one small dashed veil on every page now); the 1px nudge on a pressed button; the second focus ring
(one ring everywhere: 2px ink, 2px offset); the trade diagram's off-palette greys (slab faces are white and
`#f6f6f2`, sides `#e3e3dd` and `#c4c4bc`, the ground slab `#c4c4bc`).
