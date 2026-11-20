---
name: LV Check
description: A German bill of quantities read as a construction site under signage; trouble is a numbered sign you can read from the back of the room.
colors:
  signal-yellow: "#ffc400"
  yellow-ink: "#3a2c00"
  ink: "#121413"
  ink-2: "#3b403a"
  ink-hover: "#2d312e"
  stop-red: "#c4161c"
  note-blue: "#0a5aa8"
  plate: "#fcfcf9"
  ground: "#ecece6"
  rule: "#cdd0c7"
  concrete-mark: "#b4b9ac"
  on-ink: "#ffffff"
  on-ink-quiet: "#d9dcd4"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3rem, 6.4vw, 5.5rem)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "0.01em"
  item-number:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "84px"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.025em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.025em"
  plate-title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.025em"
  mark-number:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "36px"
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  button:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "0.025em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.5
  body-strong:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.25
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  mark: "2px"
  tag: "3px"
  control: "4px"
  plate: "8px"
spacing:
  strip: "3px"
  xs: "8px"
  sm: "12px"
  gutter-mobile: "16px"
  panel: "22px"
  gutter: "24px"
  column: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  input:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  view-tab:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    padding: "0 14px"
    height: "38px"
  view-tab-hover:
    backgroundColor: "{colors.signal-yellow}"
  view-tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  band:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    padding: "12px 24px 10px"
  section-number:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.control}"
    padding: "1px 8px 3px"
  section-number-active:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
  mark-tick:
    backgroundColor: "{colors.concrete-mark}"
    rounded: "{rounded.mark}"
    width: "8px"
    height: "36px"
  mark-block-stop:
    backgroundColor: "{colors.stop-red}"
    textColor: "{colors.on-ink}"
    typography: "{typography.mark-number}"
    rounded: "{rounded.mark}"
    padding: "0 9px"
    height: "36px"
  mark-block-caution:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.mark-number}"
    rounded: "{rounded.mark}"
    padding: "0 9px"
    height: "36px"
  mark-block-note:
    backgroundColor: "{colors.note-blue}"
    rounded: "{rounded.mark}"
    width: "22px"
    height: "36px"
  sign-plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
  sign-plate-header-stop:
    backgroundColor: "{colors.stop-red}"
    textColor: "{colors.on-ink}"
    typography: "{typography.plate-title}"
    padding: "10px 14px"
  sign-plate-header-caution:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.plate-title}"
    padding: "10px 14px"
  sign-plate-header-note:
    backgroundColor: "{colors.note-blue}"
    textColor: "{colors.on-ink}"
    typography: "{typography.plate-title}"
    padding: "10px 14px"
  severity-toggle:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "48px"
  section-chip:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.tag}"
    padding: "0 7px"
  readout:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "50px"
  finding-row-hover:
    backgroundColor: "{colors.signal-yellow}"
  table-head:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.label}"
    padding: "9px 12px"
---

# Design System: LV Check

## Overview

**Creative North Star: "The Site Signboard"**

The interface is built from the materials of a German construction site's safety signage: a signal-yellow band closed by a yellow-and-black hazard stripe, black condensed capitals, white sign plates held by a black keyline, and concrete greys underneath. The bill of quantities (Leistungsverzeichnis, LV) is treated as a site that is still under construction, and every problem in it is posted the way a site posts a hazard: as a sign with a fixed shape, a fixed colour and a number large enough to read from across the yard.

Density is that of a working tool, not a brochure. The loaded screen is a fixed two-pane workspace with no page scroll: an LV map on the left (one row per section, one mark per item, in file order), and on the right a findings list that is replaced by an item sheet when something is selected. Type is large and heavy on purpose; the second audience is a jury reading a projector from a distance, so the base text is 17px at weight 500, most reading text is 18 to 25px, and the whole interface zooms on wide screens.

The system is flat and opaque. Nothing floats, blurs or glows; hierarchy comes from keyline weight, solid colour fields and the size of condensed numerals. German LV text is shown exactly as issued and never translated in place; interface text is English.

**Key Characteristics:**
- Signal yellow is a surface, not a highlight: the band, the landing page, hover and selection all use the same yellow.
- Severity is three signs, Stop / Caution / Note, carried by shape and colour together: red circle, yellow triangle, blue square.
- Item numbers (Ordnungszahlen) are the largest and heaviest thing in every view, always in tabular condensed numerals.
- White plates with a black keyline hold content; the grey ground holds the map.
- Flat, opaque, hard-edged. The only gradient is the hard-stop hazard stripe.
- Built to be read from the back of a room: nothing below 14px, body at 17px and weight 500, captions in 20px condensed capitals, 1.2x and 1.5x zoom on large displays.

## Colors

A signage palette: one signal yellow, one black, three severity colours that each belong to exactly one sign shape, and concrete neutrals. Every colour is a solid field; none is used as a tint or at reduced opacity.

### Primary
- **Signal Yellow** (#ffc400): the band at the top of every screen, the whole landing surface, the fill of a Caution sign and a Caution block, and the single hover and selection colour for rows, tabs, chips and item-number links in the workspace. Also the text-selection and evidence-highlight colour.
- **Site Black** (#121413): all primary text, every keyline, primary buttons, the section-number tiles, the sticky table head, the readout bar and the busy and status strip. On the landing, where the page behind the plates is already yellow, a hovered dataset row inverts to Site Black with white text instead.

### Secondary
- **Stop Red** (#c4161c): the Stop sign (circle with a white bar), Stop blocks on the map, the header of a Stop plate, error notices, and the "not equal" and dimension line in an item drawing. Used for nothing else.

### Tertiary
- **Note Blue** (#0a5aa8): the Note sign (rounded square with an "i"), Note blocks on the map, the header of a Note plate. It is also the keyboard focus ring, the one colour that never appears as a fill behind a focused control.

### Neutral
- **Plate White** (#fcfcf9): sign plates, the right-hand panel, inputs, tabs at rest, the item table body.
- **Concrete Ground** (#ecece6): the page background behind the map, table group rows, the inset block that holds the original LV text, the inside of a drawn pipe.
- **Concrete Mark** (#b4b9ac): the tick that stands for an item without a finding on the map. Light enough that a row of ticks reads as texture and the coloured blocks read as the signal.
- **Soft Rule** (#cdd0c7): lines between rows of a list or table and between sections of the map, where a black keyline would be too loud.
- **Secondary Ink** (#3b403a): secondary text on plate and ground: reasons, counts, breadcrumbs, captions, anonymisation tokens.
- **Yellow Ink** (#3a2c00): secondary text when it sits on Signal Yellow (the band's file line, the landing lede, a hovered row's reason line).
- **Hover Ink** (#2d312e): the primary button's hover fill.
- **On Ink** (#ffffff) and **On Ink Quiet** (#d9dcd4): text on Site Black, Stop Red and Note Blue; the quiet step is for hints and anonymised tokens inside the readout bar.

### Named Rules
**The One Sign, One Colour Rule.** Red means Stop, yellow triangle means Caution, blue means Note. Red and blue never decorate; if a new surface needs an accent, it is Signal Yellow or Site Black.

**The Shape Carries It Too Rule.** Severity is never colour alone. Wherever a severity colour appears at small size, its sign shape (circle, triangle, square) appears with it, and the label Stop, Caution or Note is available in text.

**The Keyline on Yellow Rule.** Yellow has no edge against the grey ground or the white plate, so a yellow object placed on either always gets a black keyline: the Caution triangle is stroked (1.7 on a 24 unit grid), the Caution block carries a 2px inset keyline, the section chip a 2px border.

**The White Ring Rule.** A sign placed on a header of its own colour is outlined in white (2px), with the outline following the sign's shape.

**The Yellow Ink Rule.** Grey text is not allowed on yellow. Secondary text that lands on Signal Yellow, including on hover, switches to Yellow Ink.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, sans-serif), weights 600 and 700, self-hosted
**Body Font:** Barlow (with system-ui, sans-serif), weight 500 as the base, 600 and 700 for emphasis, self-hosted

**Character:** Barlow Condensed in bold capitals stands in for the DIN lettering of German road and site signs; Barlow, its text-width sibling, keeps long German compound nouns readable at 17 to 25px. One family, two widths, no third voice. The condensed width has two jobs: large sign lettering at 700, and one caption voice at 600.

### Hierarchy
- **Display** (700, clamp(3rem, 6.4vw, 5.5rem), line-height 0.92, 0.01em tracking, uppercase, max 12ch, balanced): the landing statement only.
- **Item number** (700, 84px, line-height 0.95, 0.01em tracking, tabular numerals; 64px below 900px): the Ordnungszahl at the top of the item sheet. The same voice steps down wherever an item or section number appears: 32px on a section tile, 28px in a findings row, 26px in the readout, 24px on a map block and in the verdict's section reference, 22px in the table, 18px on an item-number link.
- **Headline** (700, 40px, line-height 1, 0.025em tracking, uppercase; 32px below 900px): the verdict line, counts of Stops, Cautions and Notes with their signs at 36px. The upload plate's call uses the same size.
- **Title** (700, 32px, line-height 1, 0.025em tracking, uppercase): panel headings. The same voice sets the product name in the band (30px), the three sign names on the landing (34px) and plate headings (28px, line-height 1.05).
- **Button** (600, 18px, 0.025em tracking, uppercase): the primary button. The back control uses the same voice at 22px, weight 700.
- **Body** (500, 17px, line-height 1.5): explanations, captions, list reasons, the band's file line. Reading text inside plates and the table steps up to 18px (plate fields at line-height 1.45, table cells, the facts line, the readout). Long text is capped: 46ch for the lede and the verdict's sub-line, 60ch for drawing captions and empty states, 65ch for plate text, 68ch for LV text at line-height 1.6.
- **Body strong** (600 to 700, 19 to 25px, line-height 1.2 to 1.3): German item and section titles and the quoted evidence. Findings row title 19px, 600, up to two lines; table group row 19px, 700; the loaded LV's name in the band 20px, 700; evidence 21px, 600; section row title 22px, 700; sheet title 25px, 600, balanced; the landing lede 22px, 500, in Yellow Ink.
- **Label** (Barlow Condensed 600, 20px, 0.04em tracking, uppercase): the one caption voice. Field headings inside a plate ("Why it matters", "What to do"), table column heads, the findings tally, the map key, item counts and "no rule finding" on a section row, the format and phase of a dataset file, the heading over the dataset list, "LV text, as issued". Chart labels inside a drawing use it at 15 SVG units. Two smaller condensed labels exist for identifiers: the kind tag (14px, 600, 0.05em, uppercase) and the check id on a plate header (16px, 600, 0.05em).
- **Small print** (Barlow 500, 14 to 15px): the file and line an item came from (15px), a remark's path (14px), the "Show all sections" link on the section chip (14px, 600). 14px is the floor.

### Named Rules
**The Capitals Are Condensed Rule.** Uppercase belongs to Barlow Condensed only. Barlow text is always sentence case, including tabs, toggles and table group rows. A label that needs capitals is set in the condensed caption voice (600, 20px, 0.04em), never in capitalised Barlow.

**The Tracked Capitals Rule.** Condensed capitals are never set tight: 0.025em on display-weight words, 0.04em on captions, 0.05em on the small identifier labels. Condensed numerals and the landing statement, which are large enough to hold their own spacing, take 0.01em.

**The Numbers Are Signs Rule.** An item or section number is always Barlow Condensed 700 with tabular numerals, and is never smaller than the text it identifies. Quantities and money in running text stay in Barlow, also tabular.

**The German Stays German Rule.** LV text keeps its original wording, carries `lang="de"`, and is never uppercased or truncated in the item sheet (it wraps; list rows clamp to two lines, single-line contexts such as the map row and the readout may ellipsise). Anonymisation tokens such as `[FIRMA_044]` are dimmed to Secondary Ink with a dotted underline, never styled as errors.

## Layout

The loaded screen is a full-height application frame: the band on top (minimum 72px plus a 12px hazard stripe), then a two-column workspace that fills the rest of the viewport. The left column is fluid; the right column is `clamp(380px, 34vw, 580px)` and is divided from the left by a 3px black keyline. Each pane scrolls on its own; the page itself does not scroll. Outer gutters are 24px on the left pane and 22px inside the right panel.

The left pane stacks a verdict line with the view switch (LV map, Item table, Remarks), the active view, and, under the map, a fixed 50px black readout bar that names whatever mark is under the pointer. The LV map is a strip map: one ruled row per section (12px above, 14px below, a 2px Soft Rule line between sections) with a black number tile, the section title and its sign counts, then a wrapping strip of marks indented 56px to align under the title. Marks are 36px tall with 3px gaps; the first mark of each sub-section (a change in the second part of the item number) is set off by a further 9px, so the strip reads in groups without any extra labels. The map never re-flows when a filter or selection changes; marks only change state.

The landing state is a 1180px container on a full yellow surface, built as two rows of two columns with a 48px gap. First row, aligned to the bottom edge: the statement and lede on the left (1.25 parts), a plate explaining the three signs on the right (1 part, at least 300px). Second row, 44px below, two equal columns of equal height: the upload plate, and the dataset list under its caption.

Spacing is tight and regular, not airy: 3px between marks, 8 to 14px between controls and inside rows, 20px between blocks in the item sheet, 22 to 24px as pane gutters, 48px between landing columns.

**Responsive behaviour.** Below 900px the frame becomes an ordinary scrolling page: the workspace stacks (map first, panel below with a 3px top keyline instead of a left one), gutters drop to 16px, the band wraps with the file line on its own row, the landing's two-column rows collapse to one column with a 28px gap, the strip loses its indent, section row titles drop to 18px and their item counts are hidden, and the readout wraps. From 1700px the whole body zooms 1.2x and from 2300px 1.5x, so type, signs and marks grow together for projector use; nothing is re-laid-out for large screens.

### Named Rules
**The Where Before What Rule.** The map of the whole LV is the first thing a loaded file shows and is the way to navigate. Lists and tables are secondary views of the same items.

**The Whole Room Zoom Rule.** Large displays scale the entire interface (1.2x from 1700px, 1.5x from 2300px). Do not add wide-screen layouts that spread content out; make it bigger.

## Elevation & Depth

Flat. There are no resting shadows, no blur, no translucency and no overlapping layers apart from the full-screen drop target. Depth is conveyed by three things only: surface colour (grey ground, white plate, black bar), keyline weight, and position in the frame.

Keylines come in three weights, all Site Black unless noted: 3px for plates, pane dividers, plate headers and the rows of the landing's sign plate; 2px for controls, and in Soft Rule colour for the lines between map sections; 1.5px for internal dividers (Soft Rule colour between list and table rows, black inside a plate).

State is shown with rings and fills, not lift. Selection on the map is a 4px black outline offset 2px; a related item is a 3px dashed black outline; an active section tile turns yellow with a 3px black ring; keyboard focus is a 3px Note Blue outline offset 2px (4px on map marks, inset on full-width rows). Pressed and hovered marks move by a few pixels (a block rises 3px, the primary button sinks 1px) over 150ms on `cubic-bezier(0.16, 1, 0.3, 1)`; all motion is removed under `prefers-reduced-motion`.

### Named Rules
**The Keyline, Not Shadow Rule.** A surface is separated from its neighbour by a black line or a change of solid colour. If a new element seems to need a shadow, give it a keyline.

**The Stripe Means State Rule.** The yellow-black diagonal stripe appears only where the site itself is in a transitional state: under the band (the LV is under review), under the busy strip (analysis running, 6px), and around the full-screen drop target (22px). It is always hard-stopped at -45 degrees, and never a decorative divider between content blocks.

## Shapes

Hard-edged and rectilinear with barely softened corners, like pressed metal signs. Radii step with the size of the object: 2px for map marks, 3px for tags and item-number links, 4px for controls, tiles and bars, 8px for plates. Nothing is pill-shaped and nothing is fully round except the Stop sign itself.

The three sign shapes are the system's only pictorial vocabulary: a red disc with a white horizontal bar, a yellow triangle with a black stroke and a black exclamation mark, a blue rounded square with a white "i". They are drawn as inline SVG on a 24 unit grid and used from 18px (section counts) through 20 to 26px (table, map key, readout, toggles, list rows) to 30px (plate headers), 36px (verdict line) and 56px (the landing's sign plate).

Item drawings inside the sheet follow the same language: thick black outlines, ground-grey fills, a red dimension line, labels in the two type voices, all inside an ordinary plate.

## Components

### Buttons
- **Shape:** slightly softened rectangle (4px), 40px tall.
- **Primary:** Site Black fill, white Barlow Condensed capitals (18px, 600, 0.025em), 18px side padding, no border.
- **Hover / Focus:** hover lightens to Hover Ink; active sinks 1px; focus shows the 3px Note Blue outline. Disabled is 50% opacity with a default cursor.
- **Text link:** a borderless button in Barlow 600 with a 2px underline, offset 3px; the underline turns Note Blue on hover. Used for "Show in item table" and "Dismiss".
- **Back:** chevron plus Barlow Condensed capitals (22px, 700, 0.025em), no fill at rest, yellow fill on hover.

### Chips
- **Tag:** outline only (1.5px black, 3px radius), Barlow Condensed capitals (14px, 600, 0.05em), for an item's kind. Not interactive.
- **Item-number link:** 2px black border, 3px radius, plate fill, Barlow Condensed 700 at 18px; yellow fill on hover. Jumps to that item.
- **Section chip:** yellow fill, 2px black border, 4px radius; shows the active section filter with an underlined "Show all sections" (14px, 600) to clear it.
- **Severity toggle:** 48px plate-white control with a 2px black border holding a 24px sign, the label (Barlow 18px, 600) and the count (Barlow Condensed 20px, 700). Switched off, it turns to a dashed Secondary Ink border, grey text with a line through the label, and a greyed sign at 45% opacity. Three toggles sit in an equal three-column row.

### Cards / Containers
- **Sign plate:** plate-white fill, 3px black keyline, 8px radius, no shadow. Used for the upload target, the dataset list, the landing's sign plate, the item drawing and each finding.
- **Finding plate:** a sign plate with a coloured header (Stop Red, Signal Yellow or Note Blue) closed by a 3px black line; the header holds a 30px sign, the category in Barlow Condensed capitals (28px) and the check id (Barlow Condensed 16px, 600, 0.05em). Below it: the quoted evidence (21px, 600, 16px padding) closed by a 1.5px black line, then fields headed in the caption voice with 18px answers, in order: why it matters, what to do (600), money at stake (or "Not quantified"), related items.
- **Sign plate (landing):** one plate, three rows divided by 3px black lines, each 16px by 20px: a 56px sign in a fixed column, the sign's name in Barlow Condensed capitals (34px), and one sentence in Secondary Ink saying what that sign asks the estimator to do. It teaches the vocabulary before a file is loaded.
- **Upload plate:** a sign plate that is one button, at least 220px tall, 44px by 28px padding, holding the call in Barlow Condensed capitals (40px) and the accepted formats in Secondary Ink (18px). It rises 3px on hover.
- **Dataset list:** a sign plate of full-width rows (12px by 18px) divided by 1.5px black lines: file name in Barlow 600 on the left, format and phase in the caption voice on the right. A hovered row inverts to Site Black with white text.
- **Internal padding:** 14 to 18px in workspace plates; 16 to 20px in the landing's sign plate.
- **LV text block:** the original German text on Concrete Ground, 4px radius, 16px by 18px padding, 18px at line-height 1.6, line breaks preserved; quoted evidence fragments are highlighted in Signal Yellow.

### Inputs / Fields
- **Style:** search fields and selects are 40px tall, plate-white, 2px black border, 4px radius, 12px side padding; placeholder in Secondary Ink.
- **Focus:** the global 3px Note Blue outline, offset 2px.
- **Checkbox:** native, 20px, accent colour Site Black.

### Navigation
- **Band:** yellow, at least 72px tall, 24px side padding, closed by a 12px hazard stripe. Holds the product name in Barlow Condensed capitals (30px), the loaded LV's name (20px, 700) over its file, phase and price status (17px, 500, Yellow Ink), then a dataset select and the primary button. Before a file is loaded it holds the product name alone.
- **View switch:** a segmented control in one 2px black frame (4px radius), segments 38px tall divided by 2px black lines, Barlow 600 sentence case at the base size. Selected is black with white text; hover on an unselected segment is yellow.
- **Notice strip:** a full-width black bar under the band (10px by 24px, 500 weight, white). Busy adds a 6px hazard stripe below; error turns the bar Stop Red.

### LV Map (signature)
One ruled row per section, separated from the next by a 2px Soft Rule line. The row head is a button: a black number tile (Barlow Condensed 32px, 4px radius, at least 44px wide), the German section title (22px, 700, single line), then sign counts (18px signs with 20px, 700 tabular figures) and the item count in the caption voice, Secondary Ink; a section with nothing says "no rule finding" in the same voice. Hovering or activating the row turns the tile yellow with a 3px black ring and filters the findings list to that section.

Below the head, a wrapping strip holds one mark per item in file order. An item with no finding is a tick: 8px by 36px, Concrete Mark, turning black on hover. An item with a finding is a block of the same height in its worst severity's colour: Stop and Caution blocks carry the item number (Barlow Condensed 24px), Note blocks are a plain 22px blue block with no number. Severity therefore reads on one fixed height as an increase in width and loudness: tick, blue block, numbered yellow block, numbered red block. Where the sub-section changes, the next mark starts after a wider gap (9px on top of the 3px), which is the strip's only grouping device. A key in the caption voice, with the three signs at 22px and a short tick, sits above the first row. Hiding a severity turns its blocks back into ticks without moving anything.

### Readout Bar
A 50px black bar (4px radius, 18px text) pinned under the map. At rest it holds one line of instruction in On Ink Quiet; on hover or focus of a mark it shows that item's sign (22px), number (Barlow Condensed 26px), German short text and, right-aligned in Signal Yellow, its quantity and unit. It replaces tooltips.

### Findings List
The panel head carries the title (32px) and, in the caption voice, the tally of findings and items. Below the filters, one row per item, not per finding: a 26px sign for the worst severity, the item number (Barlow Condensed 28px) in a fixed 92px column, then the German short text (19px, 600, wrapping to at most two lines) over the finding categories (17px, Secondary Ink). Rows are full-width buttons, 13px by 22px, divided by 1.5px Soft Rule lines; hover fills the row yellow and switches the secondary line to Yellow Ink.

### Item Sheet
Replaces the findings list on selection. In order: breadcrumb of section titles (17px, Secondary Ink), the item number at 84px, the German short text (25px, 600) with evidence fragments highlighted, a facts line (18px; quantity in bold at 22px with unit, kind tag, prices if the file has them), the item drawing if one applies, one finding plate per finding, references to other items, then, 36px lower under a caption-voice heading, the full LV text "as issued" and the file and line it came from (15px).

### Item Drawing
A sign plate holding one SVG (max 440px wide, centred) and a caption (17px, Secondary Ink, max 60ch). Two exist: a to-scale comparison of two pipe diameters named for the same item (ground-grey discs with heavy black outlines, a red diameter line, the sizes in Barlow Condensed 24, a red "not equal" at 40 between them, "Short text" and "Long text" beneath in the caption voice), and a rank chart of the item's total among all priced items (grey bars, the item's own bar black on a yellow column with a black outline). A drawing appears only when the data supports it and its caption states the source.

### Item Table
Plate-white table with a sticky black head in the caption voice (white). Cells are 10px by 12px, 18px text, top-aligned, divided by 1.5px Soft Rule lines; numbers are right-aligned and tabular; the item number column is Barlow Condensed 22px. Each section opens with a ground-grey group row (Barlow 19px, 700, sentence case) closed by a 3px black line. A leading narrow column shows the row's worst sign at 20px. Hover and the selected row are yellow.

### Remarks
A single column capped at 78ch of collapsible entries divided by 1.5px black lines. Each summary stacks the remark's path (14px, Secondary Ink) over its first line (18px, 600, single line); opening it replaces the first line with the full German text at line-height 1.6.

## Do's and Don'ts

### Do:
- **Do** put a problem's item number on the screen bigger and heavier than anything describing it; Barlow Condensed 700, tabular.
- **Do** pair every severity colour with its sign shape and one of the three words Stop, Caution, Note.
- **Do** give any yellow object on grey or white a black keyline (2px inset on blocks, 2px border on chips).
- **Do** use Signal Yellow as the one hover and selection fill in the workspace, and switch grey secondary text to Yellow Ink (#3a2c00) when it lands on yellow.
- **Do** separate surfaces with keylines in the three established weights: 3px plates and panes, 2px controls and map sections, 1.5px internal dividers.
- **Do** set every caption, field heading and table head in the one caption voice: Barlow Condensed 600, 20px, 0.04em, uppercase.
- **Do** keep German LV text verbatim, marked `lang="de"`, with anonymisation tokens dimmed and dotted-underlined.
- **Do** say "Not quantified", "no rule finding" or "no prices in this file" in plain words where a number does not exist.
- **Do** keep reading text at 17px and weight 500 or more and small print at 14px or more, and let the 1.2x and 1.5x body zoom handle large displays.
- **Do** show focus with the 3px Note Blue outline on every interactive element, inset on full-width rows.

### Don't:
- **Don't** use Stop Red or Note Blue for anything except their severity (and, for blue, the focus ring). No red buttons, no blue links at rest.
- **Don't** invent a fourth severity colour or shape; a new state is expressed with ink, yellow, or a dashed keyline.
- **Don't** use soft gradients, blur, translucency or resting shadows. The only gradient in the system is the hard-stop hazard stripe.
- **Don't** use the hazard stripe as a decorative divider between content blocks; it marks the band, a busy state and the drop target.
- **Don't** set Barlow (the text face) in capitals, or set long German text in Barlow Condensed capitals.
- **Don't** set condensed capitals without tracking, or add a second caption style beside the 20px one.
- **Don't** put Secondary Ink grey text on yellow.
- **Don't** translate, uppercase or restyle LV text, and don't flag anonymisation tokens as errors.
- **Don't** summarise the LV as stat tiles over a table; location on the map comes first.
- **Don't** add a 3D or perspective view of the LV; one was built and rejected by the team as hard to read.
- **Don't** show a money figure, a rank or a drawing without its source in the caption; leave it out when the file has no data for it.
- **Don't** make marks on the map re-order or re-flow in response to filters; they change state in place.
