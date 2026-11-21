# Translation notes — project F

Source defects noticed in the files of this project and how they were carried over. What applies to all files is in `../TRANSLATION_NOTES.md`.

## `LV_02_PVC_Fussbodenbelag.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_02_PVC_Fussbodenbelag.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | VOB [ORT_016] C, insbesondere ATV DIN [ORT_033] | VOB [ORT_016] C, in particular ATV DIN [ORT_033] | Tokens replaced 'Teil' and the DIN number; later the text names ATV DIN 18365 explicitly. In s1397190b12 the same token [ORT_016] stands for a different word ('den [ORT_016] seiner späteren Dokumentation'). |
| p. 3 | Brandstoffklasse schwer entflammbar | fuel material class flame-retardant | 'Brandstoffklasse' is an odd word (presumably Baustoffklasse, building material class); rendered literally, not corrected. |
| p. 4 | Oberflächenfertige Laminate ... / Laminatböden ... DIN EN 13329 | Surface-finished laminates ... / Laminate floors ... DIN EN 13329 | Preliminary remarks of a PVC floor covering LV contain rules for laminate, wood skirtings, carpet skirtings - boilerplate not matching the LV content. |
| p. 4 | 3.4 Abschlüsse: Sockelleisten sollen ... / 3.5 Sockelleisten | 3.4 Terminations: Skirting boards shall ... / 3.5 Skirting boards | A skirting board paragraph stands under 3.4 before the heading 3.5 Skirting boards. |
| p. 5 | bei zu erwartender üblichen mechanischer Beanspruchung ... nicht erwartet werden | under the usual mechanical stress to be expected cannot be expected | Grammar slip ('üblichen') and doubled 'erwarten' in the source; sentence runs across the page break from s9db947c904. '[PERSON_176] Schlitze waagerecht eingestellt' is damaged by the token. |
| p. 5 | Bodenbeschichtungsauswahl | floor coating selection | Speaks of floor coating in a floor covering LV; kept. |
| p. 5 | gilt R10 als mindestens geschuldete Anforderung | R10 applies as the minimum requirement owed | Preliminary remarks set R10 as minimum, but item s4804b69319 / sfd2182746f specifies R9 and R10 is only a surcharge item (s053b43e04a). Contradiction kept. |
| p. 5 | Oberböden | floor finishes | 'Oberböden' here means top floor surfaces, not topsoil (glossary rendering not applicable). In s876ba4ae42 'vor Kopfbelichteter Flure' is oddly spaced/capitalised; rendered 'corridors lit from the end'. |
| p. 6 | Grobe [PERSON_010] die nicht durch Schleifen und Saugen zu beseitigen sind | Coarse [PERSON_010] that cannot be removed by sanding and vacuuming | Recurring pattern in this batch: anonymisation tokens replaced ordinary nouns and damage the sentence ([PERSON_010], [PERSON_016], [PERSON_014], [PERSON_129], [PERSON_125] for 'Wahl', [PERSON_043], [PERSON_029], [PERSON_057], [PERSON_033], [PERSON_108], [PERS… |
| p. 7 | Spachtel 3mm / Rissbreite bis 5 mm | filler 3mm / crack width up to 5 mm | Short text 'filler 3mm' vs long text 'up to 3 mm as basic work' - no item for thicker levelling visible. Kept. |
| p. 7 | Dampfbremse / wasserdampfdicht / ggf. Dampfsperre | Vapour retarder / water-vapour-tight / if applicable vapour barrier | Item is called vapour retarder (Dampfbremse) but required to be water-vapour-tight; the next item calls it vapour barrier (Dampfsperre). Kept. |
| p. 8 | Trittschallverbgs.-maß: | Impact sound improvmt. index: | Unusual abbreviation of Trittschallverbesserungsmaß; rendered abbreviated. The label list also contains a stray value line "EN 425" and a token [PERSON_016] as a label. |
| p. 8 | H=ca. 8cm / 8 cm | H=approx. 8cm / 8 cm | Short text 'approx. 8cm', value list (s947b4d5488) '8 cm'. Kept. |
| p. 9 | des zuvor beschriebenen Bodenbelag aus Vinyl / Auftrag des Erstpflegemittel | of the floor covering of vinyl described before / Application of the initial care products | Grammar slips in the source (missing genitive endings). s1d7681f8f6 / s62b650426a: 'für Bodenbelag aus Vinyl ohne werkseitiges Oberflächenfinish' contradicts sfd2182746f 'werkseitiges Oberflächenfinish' of the covering item. |
| p. 10 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |
| p. 10 | Das LV besteht aus den Seiten 1 bis 10 | The LV consists of pages 1 to 10 | Summary 'Summe 14.1.' / 'Summe 14.' while the LV title is '02 PVC Fußbodenbelag'; numbering kept. |

## `LV_00_Roh_und_Erdauarbeiten.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_00_Roh_und_Erdauarbeiten.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | Baustelleneinrichtung/Planung/Statik/BGK/Gerüst, SONSTIGES | Site setup/planning/structural analysis/BGK/scaffold, OTHER | 'BGK' (probably Baustellengemeinkosten) kept as code. The truncated repeats s2ebcb04374 ('…/B..') and s1430aa266f ('…während der Bau..') are cut off in the source; cut kept. |
| p. 1 | Baustelleinrichtung | Site setp | Misspelling of 'Baustelleneinrichtung' (next segment has the correct spelling); rendered with a comparable misspelling. |
| p. 1 | Wiederherstellen des geländes … - Machine, Geräte | restoring the terrain … - Mashine, equipment | 'geländes' lower-case and 'Machine' misspelled for 'Maschinen'; the latter rendered with a comparable misspelling. |
| p. 1 | Setzen von Meterrisse … Meterisse aus Kunststoffplättchen | Setting of metre-level marks … Metre-levl marks of small plastic plates | 'Meterisse' misspelled (and 'von Meterrisse' wrong case); misspelling rendered comparably. |
| p. 2 | Schuttcontainer, 7 m3, Beton/Ziegel Schuttcontainer für [PERSON_047] wie Beton, Ziegel, Holz oder Stahlschrott | Rubble container, 7 m3, concrete/brick Rubble container for [PERSON_047] such as concrete, brick, wood or steel scrap | Heading says concrete/brick, text also lists wood and steel scrap (which belong to the next item 'Holz/Metall'). Recurring pattern: [PERSON_047] replaces an ordinary word (probably 'Bauschutt') here and in sb88eb1976c, s6112892907, s79b77db8d4, seee3b0c2c5. |
| p. 2 | Schuttcontainer, 7 m3, Restmüll … Als Restmüll gelten Kunststoffe, Holz, Fenster | Rubble container, 7 m3, residual waste … Deemed to be residual waste are plastics, wood, windows | Wood appears both in the wood/metal container (sb88eb1976c) and in the residual waste container; overlap kept. |
| p. 3 | Bauwasseranschlüsse in genügender Anzahl 8 x 1" | Construction water connections in sufficient number 8 x 1" | Refers to long text sa4db2a2ea7: 'in sufficient number' and the fixed number '8 x 1"' stand side by side; the client is invoice recipient of the water bill while the item is titled connection costs and keeping available. Kept. |
| p. 5 | GFK Schacht für neues GFK Kabel | GFK shaft for new GFK cable | 'GFK' is used both for the shaft and for the cable (GFK = glass-fibre reinforced plastic would not fit a cable; possibly fibre-optic cable meant). Abbreviation kept unresolved, also in s9a5020a9fb. |
| p. 7 | Abbruch.- Erd.- Entwässerungsarbeiten | Demolition.- earth.- drainage works | Odd punctuation '.-' in the source (also 'Mehr- Minderleistungen', 'Gas -Strom- Netzanschlussvertrag'); kept. |
| p. 7 | Dicke ca. 15 cm -20 cm | thickness approx. 15 cm -20 cm | Range written as '15 cm -20 cm' after 'ca.'; kept as is. |
| p. 8 | Baufeldfreimachung Baume und Sträucher | Site clearance tres and shrubs | 'Baume' misspelled for 'Bäume'; rendered with a comparable misspelling. Long text s10e865c6e2 has 'sträucher' lower-case and singular 'Laub-, Nadelbaum'. |
| p. 9 | mit Lippenblütlern zu bepflanzen | to be planted with labiates | Odd plant family for greening topsoil heaps (legumes would be usual); translated literally. |
| p. 9 | Unbrauchbar gewordener Boden (z. B. | Soil that has become unusable (e.g. | Sentence runs over a page break into s5f79f289ec; same for s20403daf75 → s3bd34fd1ab and s4e6af09f26 → sa2d16cf4cc. English split at the same points. |
| p. 10 | [PERSON_093] ist, soweit kein kontaminiertes Material vorgefunden wird | [PERSON_093] is, provided no contaminated material is found | Recurring pattern: [PERSON_093] replaces an ordinary word (probably 'Aushub'/'Aushubmaterial') here and in s7e668efbe5, s3d95801f21, sa84a8f9962, s9cb1e5ca25, s8b86521697. |
| p. 12 | ist den AG zur Abfahrt anzumelden | is to be registered the AG for departure | Grammar slip in the source ('den AG' instead of 'dem AG'); rendered with a comparable slip. |
| p. 12 | Führt der AN nach seiner [PERSON_125] voll- oder großflächigen Aushub | If the AN, at his [PERSON_125], carries out full-area or large-area excavation | [PERSON_125] replaces an ordinary word (probably 'Wahl'); also in s18db881508. |
| p. 12 | Die Kampfmittelberäumung und Entfernung liegen im Verantwortungsbereich des AG. | The clearance and removal of explosive ordnance lie within the area of responsibility of the AG. | Same paragraph says the AN arranges the safeguarding measures and gets no extension of time, while clearance is the AG's responsibility; kept as written. |
| p. 13 | um bei den Aushubarbeiten die [PERSON_114] nicht zu beschädigen | so as not to damage the [PERSON_114] during the excavation works | Anonymisation token replaced an ordinary word. |
| p. 14 | Geotextil,1lg,G4 | Geotextile,1lyr,G4 | Short text names class 'G4'; the long text segments give no class, only 'Gewicht mind. 150 g/m2'. |
| p. 14 | Entsorgungach AVV-Schlüssel für LaGA Z0 | Disposalacc. to AVV code for LaGA Z0 | Two words run together ('Entsorgung nach'); rendered run together. 'LaGA' spelled differently from 'LAGA' elsewhere; kept. |
| p. 15 | Kies- und Schottertragschicht Schottertragschicht, lagenweise verdichtet. | Gravel and crushed stone base course crushed stone base course, compacted in layers. | Word 'Schottertragschicht' duplicated in the source; kept. |
| p. 15 | Hinterfüllung Bauwerke (Kellerwände, Arbeitsräume) vorhandenem Lagermaterial, verdichtet. | Backfilling of structures (basement walls, working spaces) existing stockpiled material, compacted. | Preposition 'mit' missing in the source; omission kept. |
| p. 16 | Rohrgrabenaushub mit Verbau bis 2,5m | Pipe trench excavation with shoring up to 2,5m | Unlike the two preceding trench items, this one does not mention backfilling, bedding or disposal; long text only repeats the short text plus soil class. |
| p. 17 | Angebotenes [PERSON_129] | Offered [PERSON_129] | Anonymisation token replaced an ordinary word (probably 'Fabrikat'); the fill-in dots here have no quotation marks. |
| p. 17 | DIN 4034 [ORT_016] 1; [PERSON_093] seitlich ... lagern; Schalung für [PERSON_185] und Köcherfundamente; Bodenplatte [PERSON_114]; je 1,00 m2 [PERSON_074]; Fens… | tokens kept in place | Recurring pattern in this batch: anonymisation tokens replaced ordinary words and product names (part of a standard, excavated soil, pad foundations, hall, wall, doors, paper, product names, girders), which damages sentences and makes several short texts unre… |
| p. 19 | Abzweig Glasfaserkabelleitung DN100 setzten | Sett branch fibre-optic cable line DN100 | Misspelling 'setzten' (for 'setzen'), rendered as 'Sett'. Item has a short text only, no long text. |
| p. 19 | Drängrabenaushub,0<1,0m | Drain trench excavation,0<1,0m | Odd depth notation '0<1,0m' kept verbatim. |
| p. 20 | Klasse W1.2-E/W.2.1-E/W.2.2-E | Class W1.2-E/W.2.1-E/W.2.2-E | Inconsistent notation of the water exposure classes (W1.2-E vs W.2.1-E / W.2.2-E with extra dot). Kept verbatim. |
| p. 24 | Köcher ca. 0,7x0,7m, höhe = 100 cm | Pocket approx. 0,7x0,7m, height = 100 cm | Pocket dimensions differ between neighbouring items: pocket height 100 cm here, pocket inserts 'bis60x70x90cm' / pocket depth 'bis ca. 90 cm' (sfa47d69623, s40460a78ad), pocket recess concrete 'bis70x70x55cm' / 'bis ca. 60-70x60-70 cm' / pocket height 'bis 55… |
| p. 25 | Schalung für Frostschürze Büro, rauh, Schalungseinsätze für Köcheraussparungen in gesonderter Position. | Formwork for frost apron office, rough, formwork inserts for pocket recesses in separate item. | Copy-paste leftover: the frost apron item refers to formwork inserts for pocket recesses, which belong to the pocket foundations. |
| p. 26 | Schalung,Rampen- und Eingansfundamente Schalung für [PERSON_185] und Köcherfundamente, rauh, Schalungseinsätze für Köcheraussparungen in gesonderter Position. | Formwork,ramp and entrnce foundations Formwork for [PERSON_185] and pocket foundations, rough, formwork inserts for pocket recesses in separate item. | Misspelling 'Eingansfundamente' rendered 'entrnce foundations'. Long text is a copy-paste leftover from the pocket-foundation formwork item (speaks of pocket foundations and pocket recesses, not ramp/entrance foundations). |
| p. 27 | bis 45 cm BP Büro bis 30 cm BP [PERSON_114] | up to 45 cm ground slab office up to 30 cm ground slab [PERSON_114] | Slab edge formwork height 'bis 30 cm' for ground slab [PERSON_114], while the slab item sab7904f0dc gives d=20cm. Kept. |
| p. 27 | Zulage Oberfläche mit Hartkorneinstreuung / Oberfläche mit Hartgesteinauflage. Pro m2 müssen mindestens 3kg Hartkornmischung gewähltes Fabrikat ....... . auf d… | Surface with hard stone topping. Per m2 at least 3kg hard aggregate mixture make selected ..... . must, onto the freshly placed concrete surface (wet in wet), | Sentence is interrupted by the fill-in field for the make and continues after a page break in s18d6169474; stray '.' at line start kept. The following segment 'Bereich Gruben' (s91d79177b9) restricts the area. |
| p. 28 | Beanspruchungsklasse: 1 (drückendes [PERSON_029] | Stress class: 1 (pressing [PERSON_029] | Anonymisation token replaced a word (probably 'Wasser)') including the closing bracket; bracket stays open. Same in s4959f74f82. |
| p. 30 | XC3 | XC3 | Exposure class value XC3 follows the attribute labels of item 'Decken,Stb,C25/30,XC1,d=24cm' (sdf1a620bb9), whose short text says XC1. Possible short text / long text contradiction (or value belongs to the later hall slab item sf7937537f5 with XC3). Kept. |
| p. 35 | gemäß [PERSON_128] 103 Rückbiegeanschluss 150/10/150 | according to [PERSON_128] 103 Rebend connection 150/10/150 | Segment joins the tail of the stud rail item's attributes with the short text of the next item (rebend connection); extraction order oddity. Similar: 'Feuchtigkeitsschutz, Gleitschicht zur' (sd3ff89ed4d) is the first half of the purpose whose second half stan… |
| p. 36 | nach WU-Richtline des DAfStb | according to WU guidline of the DAfStb | Misspelling 'Richtline' rendered 'guidline'. Also 'Zwangspannungen' here vs 'Zwangsspannungen' in sa5ac5d62d8 (spelling variant, not reproduced). |
| p. 36 | von 105-145 mm | from 105-145 mm | Service pipe diameter 105-145 mm in the attributes vs short text 'Rohrdurchführung, wasserdicht, DN200mm' (sa542a39475). Possible contradiction. Kept. |
| p. 37 | mind. 300 mm | at least 300 mm | Value appears to answer 'Fugenblechbreite:' (sdf6ef64871), while the short text s100c6a4717 says 'Arbeitsfuge,Fugenblech,250mm'. Possible contradiction 250 mm vs min. 300 mm. Kept. |
| p. 38 | [PERSON_142] [PERSON_129] Z" | [PERSON_142] [PERSON_129] Z" | Stray closing quotation mark without an opening one (opening part lost to the token). Kept. In s1f751d8739 'o. Glw.' has an unusual capital G; rendered 'or equivalent'. |
| p. 39 | Leistungbestandteile | Work componets | Misspelling 'Leistungbestandteile' (missing s), rendered with a comparable misspelling. |
| p. 40 | Lieferung und Einbau eines Bodeneinlauf | Supply and installation of a floor drain | Grammar slip in source (missing genitive -s), not reproducible in English. Item duplicates sdc79c9de5a/sc8c656c568 except that there the drain is provided by others. |
| p. 41 | FT-Stütze,H=ca. 7,60m,40x50cm,SB2 mit Konsole ... Auflagerkonsolen für [PERSON_055] Stützenkopfausbildung und Bewehrung in gesonderter Position | Precast column,H=approx. 7,60m,40x50cm,SB2 with corbel ... Bearing corbels for [PERSON_055] column head design and reinforcement in separate item | Short text s74e8f134ce says 'with corbel', long text puts bearing corbels in a separate item; the long text also lists reinforcement as included ('Einbauteilen für Transport und Montage und Bewehrung') and then as separate item. The 'without corbel' item sc19… |
| p. 43 | Leistungsumfang: schneiden, biegen und verlegen | Scope of work: cut, bend and lay | Scope of work omits 'liefern' although the neighbouring short texts (s77c1c2325a, s81c5ff3364) say supply and lay. Kept. |
| p. 44 | Plattendicke: ca. 2 cm | Slab thickness: approx. 2 cm | Odd value: slab thickness of the precast stair approx. 2 cm, same as the natural stone covering height in the sentence before (all other stair items state approx. 18 cm). Kept. |
| p. 44 | Auflagertronsole | bearing bracet | Misspelling of 'Auflagerkonsole'; rendered with a comparable misspelling. Recurs in s2c31538470 and s0a45d2e1ed. |
| p. 45 | der jeweils an die [PERSON_074] grenzenden Treppenwange | of the stair stringer adjoining the [PERSON_074] in each case | Recurring pattern in this batch: anonymisation tokens replaced ordinary words or product names and damage the sentence ([PERSON_074] in s2c242cf2ec, sf087717e9c, s23a3767908, sc764babc6b, s81ff1d6503; [PERSON_142] [PERSON_129] as product name; [PERSON_126] as… |
| p. 45 | [PERSON_142] z.B. [PERSON_142] [PERSON_129] T o.glw. | [PERSON_142] e.g. [PERSON_142] [PERSON_129] T or equivalent | Contradiction with the item heading in sbf1f17dda3 ('[PERSON_142] [PERSON_129] L"'): heading names type L, the example product names type T. Kept as in the source. |
| p. 48 | Leerverohrrung für ELT-Installation | Empty conduitting for ELT installation | Misspelling of 'Leerverrohrung'; rendered with a comparable misspelling. |
| p. 49 | 1-seitige Schalung un Bewehrung | 1-sided formwork an reinforcement | Typo 'un' for 'und' (the same line reads 'und' in s1c8f7f84a8); rendered as 'an'. |
| p. 50 | Arbeitsgerüst, Fassadengerüst NICHT MÖGLICH, DA ELEMENTFASSADE | Working scaffold, facade scaffold NOT POSSIBLE, AS UNITISED FACADE | Section heading says a facade scaffold is not possible, while the items of the section (s223ce355b1, s26af808ee7) specify a facade scaffold DIN EN 12810-1 and a stair tower built in front of the facade scaffold. Kept. |
| p. 54 | Hebegerät Gebrauchsüberlassung | Lifting device provision for use | Short text says 'Hebegerät' (lifting device), the long text s91eebbfe71 and the preceding item say 'Hebegerüst' (lifting scaffold). Kept. |
| p. 54 | für das Hebegerüst (Lastklasse 3) | for the lifting scaffold (load class 3) | Load class 3 is stated only in the extension item; the base item s0443e1ef81 gives no load class. Also the extension items for lifting scaffold, stair tower, craneable and mobile scaffold state no duration, unlike sb815922532 / s9fd90749ef. Kept. |
| p. 58 | Fertigteiltreppenlauf gerade Pos. 1; 9 Stg ca. 17,05/ 27,50 cm | Precast stair flight straight item 1; 9 risers approx. 17,05/ 27,50 cm | Short text says 9 Stg, the following long text (sb769ef63ae) says 'Steigungszahl: 10 St'. Same contradiction for s9e49a98541 (9 Stg) against the long text in se8e5c93995 (10 St). Kept. |
| p. 61 | tragend REI 90= (EN 13501) | load-bearing REI 90= (EN 13501) | Misplaced '=' (previous line: 'nichttragend= EI90'). Kept as in the source. |
| p. 62 | KS-Flachsturz zur Überdeckung einer Öffnung in Vollziegelmauerwerk. | KS flat lintel for spanning an opening in solid clay brick masonry. | Contradiction: the section and the lintel are calcium silicate (KS), the long text speaks of solid clay brick masonry (Vollziegelmauerwerk). Kept. |
| p. 63 | Größe: Größe 0,10 bis 0,25m² | Size: size 0,10 to 0,25m² | Duplicated word 'Größe'. Kept. |
| p. 65 | Durchdringung,W1.2,Klebeflansch,<300mm | Penetration,W1.2,adhesive flange,<300mm | The penetration item is class W1.2-E (s18c5cf62dd) while the surface waterproofing of the same section is W1.1-E (s7eed976127, s2f234bc35d). Also s7eed976127 describes external waterproofing of components in contact with the ground, with 'Bauteil: Bodenplatte… |
| p. 67 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_01_Fertigteiltreppen.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_01_Fertigteiltreppen.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 2 | der jeweils an die [PERSON_074] grenzenden Treppenwange | of the stair stringer adjoining the [PERSON_074] in each case | Recurring pattern in this batch: anonymisation tokens replaced ordinary words or product names and damage the sentence ([PERSON_074] in s2c242cf2ec, sf087717e9c, s23a3767908, sc764babc6b, s81ff1d6503; [PERSON_142] [PERSON_129] as product name; [PERSON_126] as… |
| p. 2 | [PERSON_142] z.B. [PERSON_142] [PERSON_129] T o.glw. | [PERSON_142] e.g. [PERSON_142] [PERSON_129] T or equivalent | Contradiction with the item heading in sbf1f17dda3 ('[PERSON_142] [PERSON_129] L"'): heading names type L, the example product names type T. Kept as in the source. |
| p. 2 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_03_Malerarbeiten.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_03_Malerarbeiten.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | Verschiedene Produkte innerhalb eines Systems dür fen nicht vermischt bzw. Verwendet werden | Different products within a system must not be mixed or Used | Word broken at line end without hyphen ('dür / fen'), double space and stray capital 'Verwendet'; capital and double space kept. |
| p. 1 | Seine Leistungen notwendig/erforderlich sind | His work are necessary/required | Sentence runs over s8c47d333dd and s2271834c32 with a stray capital 'Seine' mid-sentence; English sentence spread over the same two segments ('Der NU/AN hat' moved into the second). Same split for s38b620b436 / s1c180357b8, where the source writes 'AN/NU' ins… |
| p. 1 | - Verschmutzte Fremdbauteile (z. B. [PERSON_074] | - Soiled components of others (e.g. [PERSON_074] | Segment breaks off after the token (bracket not closed) at the end of the batch. |
| p. 1 | TGA-Ausrüstung/Austattung | building services equipment/fitings | Misspelling 'Austattung' (Ausstattung), rendered with a comparable misspelling. |
| p. 1 | Durch den NU/AN verursachter und anfallender [PERSON_047] (z. B. Folien, ...) | [PERSON_047] caused by the NU/AN and arising (e.g. films, ...) | Recurring pattern in this batch: anonymisation tokens replaced ordinary words and damage the sentences (e.g. [PERSON_047] for the word for waste, [PERSON_010] for dirt/parts, [PERSON_125] in 'nach [PERSON_125] des AG' for 'Wahl', [PERSON_129] for 'Fabrikat', … |
| p. 2 | Der NU/AN hat sorge zu tragen, das auf den von Ihm benutzten Fremdflächen | The NU/AN has to take care that on the third-party areas used by Him | Grammar/spelling slips in source: 'sorge' lower case, 'das' instead of 'dass', 'Ihm' capitalised. Capital 'Him' kept; sentence runs across three segments. |
| p. 2 | in die Jeweilige Grundposition | of the Respective base item | Wrong capitalisation of 'Jeweilige' in mid-sentence, mirrored. |
| p. 5 | Lackierung,Eckzargen/Blockzarge | Lacquering,corner frames/block frame | Short text says corner frames/block frame, long text (sd7a98e04b1) says 'Eckzarge oder Umfassungszarge' (corner frame or wrap-around frame). Both kept. |
| p. 7 | UG - 2.OG / UG-2OG / EG/1OG/2OG | basement - 2nd upper floor / basement-2nd upper floor / ground floor/1st upper floor/2nd upper floor | Translator's convention, not a source error: floor abbreviations UG/EG/OG translated (basement / ground floor / upper floor); GK = plasterboard, STB = reinforced concrete; 'GB' in '*** Bedarfsposition mit/ohne GB' rendered as 'total amount'. The source writes… |
| p. 9 | einschl. aller erfolderlichen Untergrundvorbehandlungen | incl. all requried substrate pre-treatments | Misspelling 'erfolderlichen' (erforderlichen), rendered with a comparable misspelling. |
| p. 10 | Spachtelung Treppenwangen,vollflächig,PIV,Q2 / Spachtelung der Untersichten der Betonfertigteil-Treppenläufe ... im Mittel ca. 24 cm Wangenbreite | Skim coating stair stringers,full-surface,PIV,Q2 / Skim coating of the soffits of the precast concrete stair flights ... on average approx. 24 cm stringer width | Short text (s5eb1f5c4d0) is about stair stringers, long text still speaks of the soffits of the stair flights (copied from the preceding item) while giving a stringer width. Probable copy-paste leftover, kept. |
| p. 11 | Vorstehende Grade der Schalungsstöße ... mit Diamantschelifer entgraden | Debur protruding burs of the formwork joints ... with diamond gridner | Misspellings 'Diamantschelifer' (Diamantschleifer), 'Grade'/'entgraden' (Grate/entgraten), rendered with comparable misspellings. |
| p. 11 | In einigen Räumen [FIRMA_122] Flure) ist eine Raster-Abhangdecke vorgesehen. Diese flächen bleiben unberührt. | In some rooms [FIRMA_122] corridors) a suspended grid ceiling is planned. These surfaces remain untouched. | Token swallowed the opening bracket and a word, leaving an unmatched ')'. 'flächen' in lower case in source. |
| p. 12 | mit Gasvliesgewebe | with gas fleece fabric | Misspelling 'Gasvliesgewebe'; the short text (s1fcd58355e) says 'Glasvliesgewebe' (glass fleece fabric). Kept as written. |
| p. 13 | einschl. der erfoderlichen Untergrundvorbereitung | incl. the reqired substrate preparation | Misspelling 'erfoderlichen' (erforderlichen), rendered with a comparable misspelling. |
| p. 15 | Zargen UGTechnikr. | Frames basementplant r. | Missing space between 'UG' and 'Technikr.' in source, mirrored. |
| p. 17 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_04_Porenbetonfassade.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_04_Porenbetonfassade.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | gem. der UVV ZH 1/164 UVV bei Montagearbeiten | acc. to the UVV ZH 1/164 UVV during assembly works | 'UVV' appears twice around the reference, kept. |
| p. 1 | Abdichtung der äußeren Horizontalfugen [PERSON_016] / in gesonderter Position) / mit modifiziertem Kunststoffklebemörtel ... | sealing of the outer horizontal joints [PERSON_016] / in separate item) / with modified synthetic adhesive mortar ... | Sentence runs over four segments (sdb1c3d9cb4, sc68fcda7e7, s28ca24acac, sbb1233f82d); the token replaced the words before 'in gesonderter Position)', leaving an unmatched ')'. |
| p. 3 | wie die Fuge bei Plattenströßen | as the joint at panel jionts | Misspelling 'Plattenströßen' (Plattenstößen), rendered with a comparable misspelling. |
| p. 4 | -Prüfung Untergrund auf Trag- u- Haftfähigkeit | -test of substrate for load-bearing a- adhesion capacity | Typo 'u-' instead of 'u.'; rendered 'a-'. Same in s9cb500aa40. |
| p. 4 | Richtfabrikat/System: z. Brillux, oder gleichwertig | Reference make/system: e. Brillux, or equivalent | 'z. Brillux' – the 'B.' of 'z. B.' is missing; rendered as incomplete 'e.'. |
| p. 5 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_05_[FIRMA_096].pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_05_[FIRMA_096].pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |
| p. 1 | Das LV besteht aus den Seiten 1 bis 1 | The LV consists of pages 1 to 1 | Odd page range '1 bis 1' for the joinery LV, kept. |

## `LV_06_Kautschukboden.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_06_Kautschukboden.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | Grobe [PERSON_010] die nicht durch Schleifen und Saugen zu beseitigen sind | Coarse [PERSON_010] that cannot be removed by sanding and vacuuming | Recurring pattern in this batch: anonymisation tokens replaced ordinary nouns and damage the sentence ([PERSON_010], [PERSON_016], [PERSON_014], [PERSON_129], [PERSON_125] for 'Wahl', [PERSON_043], [PERSON_029], [PERSON_057], [PERSON_033], [PERSON_108], [PERS… |
| p. 2 | Untergrundvorb.-Grundierg | Substrate prep.-primg | Truncated short text ('Grundierg'); the carpet LV has the full 'Untergrundvorb.-Grundierung' (s6e9c08ba85). Truncation kept. |
| p. 2 | Dampfbremse / wasserdampfdicht / ggf. Dampfsperre | Vapour retarder / water-vapour-tight / if applicable vapour barrier | Item is called vapour retarder (Dampfbremse) but required to be water-vapour-tight; the next item calls it vapour barrier (Dampfsperre). Kept. |
| p. 3 | Farbe nach [PERSON_125] des AN aus dem Standardprogramm. | Colour at the [PERSON_125] of the AN from the standard range. | Here the colour choice lies with the AN (contractor), whereas the other items of the batch say 'nach [PERSON_125] des AG'. Possibly an error in the source, kept. |
| p. 3 | Vollflächigkleben mit lösemittelfreiem ... / emissionsarmem Dispersionsklebstoff nach Hersteller-empfehlung. | Full-surfacebonding with solvent-free ... / low-emission dispersion adhesive according to manufacturer-recommendation. | Missing space in 'Vollflächigkleben' and stray hyphen in 'Hersteller-empfehlung' (sdc94619b24), mirrored. The sentence is split over two non-adjacent-looking segments. |
| p. 4 | ca. 2-7 mm, entsprechend / Belagstärke | approx. 2-7 mm, according to / Covering thickness | Value breaks off after 'entsprechend' (continues in label sc230143245 'Belagstärke' by column extraction). Profile height 2-7 mm for a 2 mm covering. |
| p. 4 | Schutz des neuen Bodenbelags vor Beschädigung, Verschmutzung und / Staub\nVorleistung: | Protection of the new floor covering against damage, soiling and / dust\nPreceding work: | Sentence broken across two segments; the second (s8de2171324) merges the last word with a label line. |
| p. 5 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_07_Teppichboden.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_07_Teppichboden.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | Grobe [PERSON_010] die nicht durch Schleifen und Saugen zu beseitigen sind | Coarse [PERSON_010] that cannot be removed by sanding and vacuuming | Recurring pattern in this batch: anonymisation tokens replaced ordinary nouns and damage the sentence ([PERSON_010], [PERSON_016], [PERSON_014], [PERSON_129], [PERSON_125] for 'Wahl', [PERSON_043], [PERSON_029], [PERSON_057], [PERSON_033], [PERSON_108], [PERS… |
| p. 2 | Dampfbremse / wasserdampfdicht / ggf. Dampfsperre | Vapour retarder / water-vapour-tight / if applicable vapour barrier | Item is called vapour retarder (Dampfbremse) but required to be water-vapour-tight; the next item calls it vapour barrier (Dampfsperre). Kept. |
| p. 3 | Trittschallverbgs.-maß: | Impact sound improvmt. index: | Unusual abbreviation of Trittschallverbesserungsmaß; rendered abbreviated. The label list also contains a stray value line "EN 425" and a token [PERSON_016] as a label. |
| p. 3 | [PERSON_129] wie zurvor beschriebener Teppichbodenbelag | [PERSON_129] as pevriously described carpet floor covering | Misspelling 'zurvor' (zuvor), rendered with a comparable misspelling. |
| p. 3 | Sockel, Kugelgarn, h= ca. 6cm / ca. 60 mm | skirting, Kugelgarn, h= approx. 6cm / approx. 60 mm | 'Kugelgarn' kept as product name (Fabramont Kugelgarn RESISTA, s4fe3e7f195). Note the source writes 'Fabramont'. |
| p. 4 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_08_Fliesen_und_Natursteinarbeiten.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_08_Fliesen_und_Natursteinarbeiten.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 2 | Der AN erstellt ein Messprotokoll über erforderliche Mehrstärken anhand eines Messprotokolls mit Messraster 50x50 cm | The AN prepares a measurement record of required additional thicknesses on the basis of a measurement record with measuring grid 50x50 cm | Circular wording in source (a measurement record on the basis of a measurement record), kept. |
| p. 2 | PE - Abdichtungsbahn, Bodenbdichtung | PE - waterproofing membrane, floor waterprofing | Misspelling 'Bodenbdichtung' (Bodenabdichtung), rendered with a comparable misspelling. |
| p. 2 | Systemgeeignet für die Haftigkeit des Fliesenklebers ... WC'S | System-suitable for the adhesion of the tile adhesive ... WC'S | Wrong capitalisation 'Systemgeeignet', unusual word 'Haftigkeit', and 'WC'S' with apostrophe; capital and 'WC'S' kept. |
| p. 4 | an allen [PERSON_074] sowie an Bodeneinbauteilen ... Hinterfüllung der [PERSON_016] | at all [PERSON_074] and at floor built-in components ... backfilling of the [PERSON_016] | Recurring pattern in this batch: anonymisation tokens replaced ordinary words (apparently wall / joint / choice / type and similar: [PERSON_074], [PERSON_016], [PERSON_125], [PERSON_129], [PERSON_008], [PERSON_004], [FIRMA_091], [FIRMA_028]), which damages th… |
| p. 5 | aus keramischen glasierten oder matten fliesen liefern | of ceramic glazed or matt tiles, supply | Noun 'fliesen' written in lower case in the source (also in sae9a2fd713, s6026310299, sef5abe3e02); cannot be mirrored in English, rendered normally. |
| p. 6 | siehe Plan (raumhoch/ bis 1,40 m ü. | see drawing (room height/ up to 1,40 m above | Value line breaks off and continues in the next segment 'Brüstungshoch)'; 'up to 1,40 m above sill height' is itself odd wording. Kept as is. |
| p. 8 | Ab-/EindichtungÜbergang | Sealing off/inTransition | Space missing between the two words in the source; kept. |
| p. 8 | Ab-/EindichtungÜbergang | Sealingtransition | Missing space between two words in the short text; rendered without space. |
| p. 8 | Anschlußbereich Boden <> [PERSON_074] | connection area floor <> [PERSON_074] | Recurring pattern in this batch: an anonymisation token replaced an ordinary word (here probably the wall), also in sa9ff3452e5 (unclosed bracket, token for the word after 'nicht drückendes'), sa186b0b505, sb1b5da1dc7, sa277ebe931, s49d7dcd530 / s2000e9d9ec /… |
| p. 11 | Bodenb elag aus Naturstein 1cm | Floor c overing of natural stone 1cm | Stray space inside the word 'Bodenbelag'; rendered with a comparable stray space. |
| p. 13 | Liefern und Verlegen einer - Trennfugenschiene im Bodenbereich [PERSON_115] 3 mm | Supply and lay a - separation joint rail in the floor area [PERSON_115] 3 mm | Dangling dash where a product name is missing (copy-paste leftover from the previous item 'einer [PERSON_115] - Abschlußschiene'); token moved to the last line in the source. |
| p. 13 | Dauerelastsiche Verfugung ... aus elasischem Fugenmaterial | Permanently elastci jointing ... of elasic joint material | Two misspellings ('Dauerelastsiche', 'elasischem'), rendered with comparable misspellings. |
| p. 13 | Summe 13. / 08 Fliesen- und Natursteinarbei.. | Total 13. / 08 Tile and natural stone wor.. | Section totals are numbered differently from the document headers: totals 13.x in LV '08', 9.2 in LV '09', 6.x in LV '12 Dachabdichtung'. Headers s1d4d139e21, s294c3ff64e, s57ecbbf5e1 are cut off in the source ('..'); cut kept. |
| p. 13 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

Text boxes where the English had to be shrunk below 72 % of the original size (3):

- p. 1, scale 0.7: Preceding work (by others on site):
- p. 5, scale 0.7: Preceding work (by others on site):
- p. 11, scale 0.7: Preceding work (by others on site):

## `LV_09_Porenbetondach.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_09_Porenbetondach.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | gem. der UVV ZH 1/164 UVV bei Montagearbeiten | acc. to the UVV ZH 1/164 UVV for assembly work | 'UVV' appears twice; kept. |
| p. 1 | Dachneigung: ca. 2° | Roof pitch: approx. 2° | Roof pitch given as approx. 2° here, while the girder item s66ccb34387 in the neighbouring LV says 'ca. 2% Gefälle' (2 % and 2° are not the same). Both kept. |
| p. 2 | Nach Montageanweisung und Verlegeplan fachgerecht auf bauseitig vorhandenen, planebenen Stb.-FT - Dachbindern (+/- 5 mm Toleranz) von außen, inkl. Lieferung ... | Acc. to assembly instructions and laying plan professionally on level RC precast - roof girders existing by others on site (+/- 5 mm tolerance) from outside, i… | Sentence has no verb (the word for 'lay/assemble' is missing); left without verb. |
| p. 2 | Herstellen von Schräg-/Gehrungs-/Passschnitte bei einer Plattendicke von 250 mm | Making bevel/mitre/fitting cuts for a slab thickness of 250 mm | Surcharge for cuts is defined only for slab thickness 250 mm although a 300 mm slab item exists (s7a893d76b4); possible gap. Kept. |
| p. 4 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_10_Stahlbetonfertigeile_Stuetzen_Binder.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_10_Stahlbetonfertigeile_Stuetzen_Binder.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | - Stützenkopfausbildung (Verjüngung des Querschnitts als Auflager der | - Column head formation (tapering of the cross-section as bearing of the | Sentence split over two segments (continues with 'Binder)' in s1b13a1198c); split kept. |
| p. 4 | FT-Stütze,H=ca. 6,84m,40x40cm ... Auflagerplatten ... 250/350/10 mm | Precast column,H=approx. 6,84m,40x40cm ... Bearing plates ... 250/350/10 mm | Bearing plate 250/350 mm on a 40x40cm column is the same text as for the 40x50cm columns; possibly a copy-paste leftover. Kept. |
| p. 6 | Sockelelemenet | plinth elemenet | Misspelling of 'Sockelelement', rendered with a comparable misspelling. |
| p. 6 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_11_Stahlbetonfertigeile_Sandwichsockel.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_11_Stahlbetonfertigeile_Sandwichsockel.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 4 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_12_Dachabdichtung.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_12_Dachabdichtung.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 2 | -Kälte.-u.Hitzebeständig -Beständig gegen Einflüsse Umweltverschmutzungen | -Cold.- and heat-resistant -Resistant to influences environmental pollution | Odd punctuation ('Kälte.-u.') and a missing word ('Einflüsse [durch] Umweltverschmutzungen'); kept as odd. The list item 'nach' / 'DIN CEN/TS 1187' is split over segments. |
| p. 2 | PVC-P Kunststoff Abdichtungsbahn ... Richtfabrikat: z.B. FDT Rhenofol CV oder Bauder FPO Thermoplan T20 | PVC-P plastic waterproofing membrane ... Reference make: e.g. FDT Rhenofol CV or Bauder FPO Thermoplan T20 | Item specifies a PVC-P membrane, but one reference product is an FPO membrane (different material). Also substrate 'Porenbeton Dachplatten, d = 250 mm' (s44e7715fd1) appears under the office roof whose preceding work is an in-situ concrete roof slab (s8d69c9b… |
| p. 3 | RWA-Lichtkuppel,2schalig,starr ... Beschlag: starr ... Einschl. RWA-Motoröffner | SHEV dome rooflight,2-skin,fixed ... Fitting: fixed ... Incl. SHEV motor opener | Dome rooflight is described as fixed (starr) but also as smoke/heat exhaust unit incl. motor opener and as roof access hatch; contradiction kept. 'RWA' rendered as 'SHEV'. 'U,G= 2,70 W/m2K' (s40017f0463) odd notation kept. |
| p. 3 | Dachaustieg Büro | Roof acess hatch office | Misspelling of 'Dachausstieg' (spelled correctly in s5479a11297), rendered with a comparable misspelling. |
| p. 5 | liefern und zuverlegen | supply and tolay | 'zu verlegen' written as one word / wrong verb form; rendered as 'tolay'. Short text says 50/50/5, long text 50/50/5,0. |
| p. 7 | für vorbeschreibenen Dachaufbau | for previously descrbied roof build-up | Misspelling of 'vorbeschriebenen' (also in s49966c3df8), rendered with a comparable misspelling. Short text has no DN, long text says DN 100/125. |
| p. 7 | Befestigungsuntergrund:Porenbeton.-Attika | Fixing substrate:aerated concrete.-parapet | Odd punctuation '.-' and missing space after the colon; kept. |
| p. 8 | Abdichtungsarbeiten Terasse | Waterproofing works terace | Misspelling of 'Terrasse', rendered with a comparable misspelling ('Terrassenbelag' in s64054f4149 is spelled correctly). |
| p. 8 | Anschlüße | conections | Misspelling (Anschlüsse), rendered with a comparable misspelling. |
| p. 8 | einschl. Anschlüße an aufgehende Bauteile | incl. conections to rising components | Misspelling 'Anschlüße' (also s3f0ff57146, sd38fa723ea), rendered with a comparable misspelling. |
| p. 10 | Max. zulässige Nutzlast: 4 KN/m2 | Max. permissible imposed load: 4 KN/m2 | 'KN' with capital K (elsewhere 'kN'); kept verbatim. |
| p. 11 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_13_ELT.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_13_ELT.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | Die Einheitspreise beinhalten Lieferung, Montage ..., Kosten für anteilige innere Verdrahtung, ... sind im Verteilerpreis enthalten. | The unit prices include supply, assembly ..., costs for proportionate internal wiring, ... are included in the distribution board price. | Two sentences run together without a full stop; the run-on is kept. |
| p. 1 | geltende Normen: DIN VDE [TELEFON_064] | applicable standards: DIN VDE [TELEFON_064] | Standard number replaced by an anonymisation token (also s82288836ce). |
| p. 3 | System-In: bis 63A A , | System-In: up to 63A A , | Unit 'A' duplicated; kept. 'Einsatz: Flurverteiler für Hotelzimmer' (sbe2490d192) mentions hotel rooms although the project is an office / training hall building: likely copy-paste leftover, kept. |
| p. 4 | nach DIN VDE [TELEFON_086] und 530, | acc. to DIN VDE [TELEFON_086] and 530, | Anonymisation token replaced the standard number(s); the neighbouring items read 'DIN 43880 und DIN VDE 0641'. Left as is. |
| p. 5 | [KENNZEICHEN_006] A, [PERSON_129] A, 2-polig | [KENNZEICHEN_006] A, [PERSON_129] A, 2-pole | Recurring pattern in this batch: anonymisation tokens replaced ordinary words and product designations ([PERSON_129] apparently 'Typ', [PERSON_002] apparently 'Fabrikat', [KENNZEICHEN_00x] cable/device type and ratings, [PERSON_074]/[FIRMA_101] wall/ceiling, … |
| p. 6 | Betriebsspannung. wahlweise 8, 12, 24, 230 V | Operating voltage. optionally 8, 12, 24, 230 V | Full stop instead of colon after the label; kept. |
| p. 6 | ÜSS-Kombiableiter (4polig) TN-S | Surge protection combined arrester (4-pole) TN-S | Abbreviation 'ÜSS' (Überspannungsschutz) written out by meaning; '4polig' rendered '4-pole'. Contact codes S/Ö elsewhere in the batch (4S, 3S+1Ö, 2S) rendered NO/NC. |
| p. 6 | Vorsicherung: selektiv zur Verteielersicherung | Back-up fuse: selective to the distribtuion board fuse | Misspelling 'Verteielersicherung' (Verteilersicherung) rendered with a comparable misspelling. |
| p. 8 | Betriebspannung : 230 V AC | Operatng voltage : 230 V AC | Misspelling 'Betriebspannung' (Betriebsspannung) rendered with a comparable misspelling. Same segment: grammar slip 'mit externen Lichtsensor', not reproducible in English. |
| p. 10 | gleichwertigen Hohlräumen sind [PERSON_146] | equivalent cavities, [PERSON_146] | Sentence is split over three segments (s7901a67150, sa2c3f28dc6, se0ccbb1d4d) and its subject was replaced by a token; English follows the same split. |
| p. 12 | Standartinstallationsgeräten | standart installation devices | Misspelling 'Standart' (Standard) kept as 'standart'. Also 'für den einbau' written lower-case in the source. |
| p. 13 | Sammelhalterung 30 ... kleine Ausführung zur Aufnahme bis 30 x NYM 3x1,5 | Collective cable holder 30 ... small version to hold up to 30 x NYM 3x1,5 | 'kleine Ausführung' is the same wording as for the size 15 holder (sd057171d6a); possible copy-paste leftover. |
| p. 13 | Befestigungsmaterial.Unterflurdosen mit [PERSON_048] | fixing material.Underfloor boxes with [PERSON_048] | Missing space after the full stop kept; sentence continues in fragments sc1e68ea554 ('je nach einsatzzweck, sowie', lower-case noun) and s21991b6a5e, with a token in place of a word. |
| p. 14 | Geplanter Einsatz: [FIRMA_125] | Planned use: [FIRMA_125] | Intended place of use replaced by an anonymisation token (the sibling item says 'Büros'). |
| p. 15 | Geräteeinsatz 6-fach eckig ... 6 Installationsgeräte in 3 Gerätebechern 9 Einzelgeräte | Device insert 6-gang square ... 6 installation devices in 3 device cups 9 individual devices | Short text says 6-gang, 'possible equipment' lists 6 devices and also 9 individual devices; unclear, kept. |
| p. 17 | Bohrung Ø 20mm (Beton) / Durchmesser 10 bis 25 mm | Drill hole Ø 20mm (concrete) / Diameter 10 to 25 mm | Short text gives one diameter, long text a range (also 'Ø 65mm' vs '25 bis 100 mm' in s474a1f7600/sd76f56afdf). Kept. |
| p. 18 | Brandschott S90 - 200cm² ... für Öffnungen bis 0,2 m² | Fire seal S90 - 200cm² ... for openings up to 0,2 m² | Contradiction: 200 cm² is 0,02 m², the long text says 0,2 m². The sibling item (800cm² / 0,08 m²) is consistent. Kept. |
| p. 19 | Flammschutzmasse / Flammschutzbeschichtung | Flame retardant compound / Flame retardant coating | Short text (sd1ce0b971f) says 'Flammschutzmasse', long text says 'Flammschutzbeschichtung'. Kept as different terms. |
| p. 20 | wasserdicht gegen nicht drückendes [PERSON_029] min. 0,5 bar | watertight against non-pressing [PERSON_029] min. 0,5 bar | 'Non-pressing' water combined with a pressure rating (0,5 bar here, 'bis 2,5bar' in s83d65eddcf and sc2cb1028b5) is contradictory; token replaced the word 'Wasser'. Heading sedbf567c4a / sbc65f9559e has an unclosed bracket. Kept. |
| p. 20 | Fundamenteinführung KD150 / KD 150 / aØ160mm | Foundation entry KD150 / KD 150 / outer Ø160mm | Product code written 'KD150' in the short text and 'KD 150' in the make line; 'aØ' rendered 'outer Ø'. Kept as written. |
| p. 21 | Für Anderung der Belegung | For chnage of the occupancy | Misspelling 'Anderung' (Änderung) rendered with a comparable misspelling. '1 Lagig' and 'wechseleinsatz' (lower-case) are also irregular in the source. |
| p. 24 | Einsatz als Präsens- und/oder Bewegungsmelder | Use as presense and/or motion detector | Misspelling 'Präsens' (Präsenz) rendered 'presense'. |
| p. 25 | Signalleitungsanschluss bis 5 Adern / Anschlussleistung Signalleitung 4 DA / bis 2 x 2 x 0,8 bzw. bis 5 Adern | Signal cable connection up to 5 cores / Connection service signal cable 4 pairs / up to 2 x 2 x 0,8 or up to 5 cores | 'DA' (Doppelader) rendered 'pairs'. The counts do not match: '4 DA' against 2 x 2 and 5 cores; likewise '10 DA' against 4 x 2 / 10 cores (s1af0ca3584) and '20 DA' against 10 x 2 / 20 cores (scf4d6a3fa6). Kept. |
| p. 27 | Anbauleuchte Wanne 1,5m 6000 / Lumen 5600 / LED6000 / Leistung 29W LED | Surface-mounted luminaire diffuser 1,5m 6000 / Lumen 5600 / LED6000 / Power 29W LED | Short text and make say 6000, technical data say 5600 lumen; power 29W is identical to the 1,2m / 4000 lumen item (s2a02f2fdc1), possible copy-paste leftover. Kept. |
| p. 28 | Anbauleuchte Rund 1000 / Lumen 1300 | Surface-mounted luminaire round 1000 / Lumen 1300 | Short text and make (LED1000) say 1000, technical data say 1300 lumen. Similar: 'Rund 2000' with 'Lumen 2100' (s22bdb08275) and 'Einbauleuchte 1000 R150' with 'Lumen 1320' (s4f4e3b48b6). Kept. |
| p. 30 | Deckenauschnitt | Ceiling cutot | Misspelling (Deckenausschnitt), rendered with a comparable misspelling. |
| p. 30 | Deckenauschnitt 150x150mm | Ceiling cuttout 150x150mm | Misspelling 'Deckenauschnitt' (Deckenausschnitt) rendered with a comparable misspelling. Same segment: '[PERSON_129]' line has no value (it follows in the next segment 'Einbau'); '1,1Kg' and '4000k' unit spellings kept. |
| p. 30 | [PERSON_129] LED-Gerätetrager für Lichtbandsystem | [PERSON_129] LED gear trey for continuous-row lighting system | Misspelling 'Gerätetrager' (Geräteträger) rendered as 'gear trey'. Recurring pattern in this batch: anonymisation tokens replaced ordinary words, e.g. [PERSON_129] (probably a label such as type/design), [PERSON_002] (label before the reference make), [PERSON… |
| p. 33 | als Fundamenterder nach DIN 0141 und 0185 | as foundation earth electrode acc. to DIN 0141 and 0185 | Standard references look odd ('DIN 0141 und 0185' are VDE numbers; 'DIN VDE 0100 [ORT_016] 200' has a token in place of a word). Kept as written. |
| p. 33 | mit Korrossionsschutz oder aus [PERSON_115] | with corrossion protection or made of [PERSON_115] | Misspelling 'Korrossionsschutz' rendered as 'corrossion protection'. Material replaced by token; sentence structure of the last paragraph (Bewehrungskörbe ... als Matten) is ambiguous in the source. |
| p. 33 | Halterung entsprechend Dachaufbau / | Holder according to roof build-up / | Segment breaks off after the slash; the sentence continues in the next segment ('Deckung'). |
| p. 34 | Maßer: 20 x 2,5mm | Dimensons: 20 x 2,5mm | Misspelling 'Maßer' (Maße) rendered as 'Dimensons'. |
| p. 35 | Befstigungsplatte | fastning plate | Misspelling 'Befstigungsplatte' rendered as 'fastning plate'. |
| p. 35 | Fangstange 2 m / Höhe: 1,00 bis 2,5 m ... Materail: [PERSON_095] | Air-termination rod 2 m / Height: 1,00 to 2,5 m ... Matreial: [PERSON_095] | Misspelling 'Materail' rendered as 'Matreial'. Short text says 2 m, long text gives a height range 1,00 to 2,5 m. |
| p. 35 | Fangstange 9 m / Höhe: 4 bis 9 m ... Durchmesser: 16 / 10 mm ... Materail: [PERSON_095] | Air-termination rod 9 m / Height: 4 to 9 m ... Matreial: [PERSON_095] | Misspelling 'Materail' again. Short text says 9 m, long text gives 4 to 9 m; text otherwise copied from the 2 m rod (same diameter 16 / 10 mm and ballast concrete blocks), possible copy-paste leftover. |
| p. 37 | Material: Kupfer, flexibal | Material: copper, flexibal | Misspelling 'flexibal' (flexibel) rendered as 'flexibal'. |
| p. 39 | Baustellen-Kleinverteiler - Vorhalten und Betreiben / Anschluss-Kleinverteiler - Vorhalten und Betreiben | Small site distributor - ... / Connection small distributor - ... | Short text (s0cf6e777e1) and long text (sefa82f1280) name the object differently (Baustellen-Kleinverteiler vs Anschluss-Kleinverteiler vs Elektro-Kleinverteiler); the related erection item calls it 'Baustellen-Kleinverteilerschrank'. Similarly 'Anschluss-Bau… |
| p. 40 | inklusive regelmäßige Scihtprüfung | including regular viusal inspection | Misspelling 'Scihtprüfung' (Sichtprüfung) rendered as 'viusal inspection'; repeated in s3bd88351b4 and s9a6a35ff55. Unit price is 'per piece and week' for a cable with a calculation basis of approx. 50 m. |
| p. 41 | Baustrom-Kabel 5 x 70mm² / Baustrom-Kabel - Errichten ... als [PERSON_174] | Construction power cable 5 x 70mm² / Construction power cable - erection ... as [PERSON_174] | Long text heading differs from short text and from the pattern of the 5 x 6 and 5 x 25 items; 'als [PERSON_174]' has a token in place of the cable type. In s9a6a35ff55 the same cable is called 'Anschlusskabel' instead of 'Baustromkabel'. |
| p. 41 | Industrie-Wannenleuchte / Baustellenleuchte ... mit [PERSON_078] Stecker | Industrial batten luminaire / Site luminaire ... with [PERSON_078] plug | Short text 'Industrie-Wannenleuchte', long text heading 'Baustellenleuchte'. In s191353c7ac grammar slip 'für vorgenannten Baustellenleuchte'. |
| p. 43 | Baustelleneinrichtung Elektotechnik | site setup electical engineering | Misspelling 'Elektotechnik' rendered as 'electical engineering'. |
| p. 43 | Durchschleifen unterbrochender Endstromkreise | looping through interupted final circuits | Misspelling 'unterbrochender' (unterbrochener) rendered as 'interupted'. |
| p. 45 | ohne relevanten Materaileinsatz | without relevant matreial use | Misspelling 'Materaileinsatz' rendered as 'matreial use'. |
| p. 46 | gemäß gebotener Gerätetechnik und und zeitnaher Bauwerksgestaltung | according to the equipment offered and and up-to-date building design | Duplicated 'und und' in the source, kept as 'and and'. |
| p. 46 | entsprechend dem durch dem Bauherren abgenommenen Zustand | according to the condition accepted by the building owner | Grammar slip in the source ('durch dem Bauherren'); not reproducible in English. The sentence continues in s30537bb069, where '[PERSON_097]' replaces a word. |
| p. 47 | Rufanlagen [PERSON_049] 452 [PERSON_049] 453 ELA-Technik [PERSON_049] 454 | Call systems [PERSON_049] 452 [PERSON_049] 453 Public address technology [PERSON_049] 454 | The line for 453 has no designation in the source; [PERSON_049] replaces a label (probably the cost group abbreviation). |
| p. 48 | Der Abschnit umfasst ... zur den Netzwerkschränken | The divison comprises ... to the the network cabinets | Misspelling 'Abschnit' rendered as 'divison'; grammar slip 'zur den' rendered as 'to the the'. |
| p. 49 | Dokumantationen aktualisieren | update documantation | Misspelling 'Dokumantationen' rendered as 'documantation'. |
| p. 49 | Zugangskontrollanalage | Access control sytsem | Misspelling 'Zugangskontrollanalage' rendered as 'sytsem'. The access control / door communication items sit under 'KG 456 Gefahrenmelde- und Alarmanlage'. |
| p. 50 | Ausgangspannung 12V AC/ 27,5V DC | Outpt voltage 12V AC/ 27,5V DC | Misspelling 'Ausgangspannung' (Ausgangsspannung) rendered as 'Outpt voltage'; repeated in s782e82fe5d. |
| p. 51 | mit Namensschild und 1 seperater Ruftaste | with name plate and 1 seperate call button | Misspelling 'seperater' rendered as 'seperate'. |
| p. 51 | Hammerschlag rechts oder Links | Hammer blow right or left | Odd wording in the source ('Hammerschlag' where a door handing such as DIN right / left would be expected); translated literally. |
| p. 51 | Klasse E . Das Netz ist mind. für Kategorie 6a , mind. 250 MHz auszuführen, als Kabel ist Kat. 7 einzusetzen. | class E . The network is to be executed for min. category 6a , min. 250 MHz, as cable Cat. 7 is to be used. | Inconsistent requirements: class E / 250 MHz alongside category 6a and Cat. 7 cable; the outlet in s8eaf9eeab4 asks for 'Kategorie 6A , 500 MHz , Klasse 6A' (a class 6A does not exist), the patch panel in sba8de66317 is Cat.6a but only 'Klasse E ... bis 250 M… |
| p. 52 | Nivelierfüße | levellling feet | Misspelling 'Nivelierfüße' (Nivellierfüße) rendered as 'levellling feet'. Short text 'Schaltschranksockel', long text speaks of 'IT-Schrank'. |
| p. 53 | 50x RJ45 ... bedruckt mit Portnummern 1-25 | 50x RJ45 ... printed with port numbers 1-25 | 50 ports but port numbers 1-25; kept. The description breaks across segments (continues in sba1ff60465). |
| p. 54 | 1 Spleißkassette ... für max. 24 Crimpspleiße (12 x SC duplex; max. 4 Spleißkassetten) | 1 splice cassette ... for max. 24 crimp splices | Item mixes two descriptions of the same panel (s245e9adcf1 'Einbauverteilfeld / Spleißschublade' and scf55fb7bf2 'Rangierverteiler'), looks like pasted manufacturer text. Make 'Telegärtner' named together with 'Nokia' and 'System Telekom'. |
| p. 55 | Spleißkassette 12 x E09/125 / 12 Faserpigtails E9/125 µm OS2 | Splice cassette 12 x E09/125 / 12 fibre pigtails E9/125 µm OS2 | Fibre type written 'E09/125' in the short text and 'E9/125' in the long text; single-mode OS2 cassette in a section whose patch panel is specified for multimode OM3 (s245e9adcf1). |
| p. 55 | Funknetze DECT, WLAN, PSA usw. | radio networks DECT, WLAN, PSA etc. | Abbreviation 'PSA' kept as written (not expanded). Item has no quantity basis or deliverable stated beyond documentation in floor plans. |
| p. 57 | von Patchfeld bis Datenanschlußdose | from patch panel to data connection outlet | Long text of item 'Messung LWL-Strecken' (s7dd0569ee6) describes a measurement from patch panel to data outlet, apparently copied from the Cat.7 copper link item; kept. |
| p. 57 | nach Kat.6a und LWL | according to Cat.6a and fibre-optic | Category is inconsistent across neighbouring segments: outlet 'mind. Kategorie 6A' (sa8ac68ca15), cable and link measurement 'Kategorie 7' / 'Kat.7' (se83396ddb8, s085b06201c), documentation of measurement 'nach Kat.6a'. Kept as is. |
| p. 57 | im Bestand verbleibender Komponeten | of componets remaining in the existing installation | Misspelling 'Komponeten' (Komponenten) rendered as 'componets'. |
| p. 58 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_14_Sanitaeranlage.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_14_Sanitaeranlage.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | [PERSON_056] mit geprüften [PERSON_056] mit geprüften | [PERSON_056] with tested [PERSON_056] with tested | First line is duplicated in the source (short text repeated at start of long text, the subject replaced by a token). The sentence 'Verlegung nach Herstellerrichtlinien unter Einhaltung der DIN EN 12056 und DIN 1986-100.' also appears twice in the same segment… |
| p. 1 | [PERSON_129] der Planung: | [PERSON_129] of the design: | Recurring pattern in this batch: anonymisation tokens replaced ordinary words / material names and damage the sentence ([PERSON_129] where 'Fabrikat' stands untokenised in sd8f213f487; [PERSON_056] in s1c6ee5e624; [PERSON_094] in s71b98fb5a4; [PERSON_069] in … |
| p. 4 | Abwasserrohr schallgedämmt >20db DN 56 | Wastewater pipe sound-insulated >20db DN 56 | Short text says '>20db', long text (sae22e5c252) says 'Referenzschallwert von <20 dB(A)'. Same in s334d6b1650 and s29fd1e2c37. Contradiction kept. |
| p. 4 | Diese sind wie Passstücke, Verschnitt, Befestigungs- und Kleinmaterial in die Einheitspreise | These are, like adapter pieces, offcuts, fixing and small material, in the unit prices | Sentence is split across a page break; it ends in s0443047bb6 ('einzukalkulieren.' → 'to be included in the price.'). Same kind of split in sd61e77ae95 / s76d83c148c. |
| p. 5 | DN 70, da 78 mm | DN 70, da 78 mm | Outside diameter 78 mm for DN 70 looks odd next to 'DN 56, da 56 mm' and 'DN 100, da 110 mm' (the PP pipe DN 70 in s9d086d5328 is 75 x 2,6 mm). Kept verbatim. |
| p. 5 | Mineralstoffvertärktes PE-HD Übergangsstück | Mineral-reinfoced PE-HD transition piece | Misspelling 'Mineralstoffvertärktes' (…verstärktes) rendered as 'Mineral-reinfoced'; same in sabf17f5ed2 and s6b54049019. |
| p. 6 | Stütz- und Dehnmuffe einscließlich [PERSON_069] und Zubehör | Support and expansion socket inclding [PERSON_069] and accessories | Misspelling 'einscließlich' rendered as 'inclding' (the DN 70 twin s32f063fe6f spells it correctly). |
| p. 7 | Anschluss an Entlüftungsleitung DN 150/ an Dachhaube DN | Connection to vent line DN 150/ to roof cowl DN | Item 'Anschluss Strangbelüftung über Dach DN 150': the long text continues in sf2294841da with roof cowl DN '100', apparently a copy-paste leftover from the DN 100 item (s0dbf9c697e). Kept. The sentence is split over two segments in the source. |
| p. 9 | Die Forderungen des Brandschutzes ... ist zwingend umzusetzen. | The requirements of fire protection ... is to be implemented without exception. | Plural subject with singular verb in the source; mirrored in English. |
| p. 11 | Absperrventil, DN 15 (Press 15), m.E. | Shut-off valve, DN 15 (Press 15), w. drain | 'm.E.' read as 'mit Entleerung' (the base description has 'mit Entleerungsventil im Gehäuse'); the abbreviation is not explained in the source. The base description names the 'Niro-San' pipe system although the pipes tendered are Viega Sanpress INOX; kept. |
| p. 14 | [PERSON_129] Judo / SPEEDYMAT-LongLife JSY-LF-A 1 1/2" | [PERSON_129] Judo / SPEEDYMAT-LongLife JSY-LF-A 1 1/2" | Make line names size 1 1/2", technical data of the same item (s696fd54aac) say 'Rohranschluss 1 1/4 Zoll'. Contradiction kept. |
| p. 17 | absperrbar mittels beiliegendem Imbusschlüssel SW 5 | lockable by means of enclosed Alen key SW 5 | 'Imbusschlüssel' (correct: Inbus) rendered as 'Alen key'. The item has no proper short text: the description starts mid-sentence in s7aab4d5e81 ('zur Probenahme von Trinkwasser, zur') and the object (sampling valve) is never named. |
| p. 18 | entsprechend den Anforderungen der SR 2 TÜV-geprüft | in accordance with the requirements of SR 2 TÜV-tested | No make is named for this item, yet a 'gew. [PERSON_129]' line follows (s9c136e55d7). |
| p. 18 | mit geeignetemDesinfektionsmittel | with suitabledisinfectant | Missing space in the source rendered with a missing space. |
| p. 19 | Manometer, mit Rohrfeder, Gehäuse aus [PERSON_089] Manometer, mit Rohrfeder, Gehäuse aus [PERSON_089] lackiert | Pressure gauge, with Bourdon tube, housing made of [PERSON_089] Pressure gauge, with Bourdon tube, housing made of [PERSON_089] painted | Short text and start of long text run together in one segment (same in sa6f8aabe54); kept as duplicated. |
| p. 20 | Tiefspül-WC, 4,5/6 l, EN 997, DIN-EN 38 | Washdown WC, 4,5/6 l, EN 997, DIN-EN 38 | Short text 'DIN-EN 38', long text (sc8d01d86e1) 'EN 38' and additionally 'EN 997 6 A/C'; kept as written. |
| p. 20 | Mit dauerhaft gebrannter, porenfreier GlasuKeraTect(r) | With permanently fired, pore-free glazKeraTect(r) | 'GlasuKeraTect' is 'Glasur KeraTect' with a letter and the space missing; rendered as 'glazKeraTect'. |
| p. 23 | HEWI 477-Reservepapierhalter f. 2 Rolle | HEWI 477 spare paper holder f. 2 roll | Singular 'Rolle' after '2' (truncated short text); mirrored as 'roll'. |
| p. 24 | - einfaches Auswechseln des Bürstenkopfs durch | - easy replacement of the brush head by | Sentence breaks off at the end of the batch (continues in the next batch). |
| p. 24 | [PERSON_129] HEWI / 477.20.100 ... gew. [PERSON_129] | [PERSON_129] HEWI / 477.20.100 ... sel. [PERSON_129] | Recurring pattern in the whole batch: the anonymiser replaced ordinary words by tokens ([PERSON_129] where 'Fabrikat' is expected, [PERSON_138] where 'Waschtisch' is expected, [PERSON_074], [PERSON_101], [PERSON_176], [PERSON_115], [PERSON_078], [PERSON_163],… |
| p. 25 | [PERSON_061] für [PERSON_061] | [PERSON_061] for [PERSON_061] | Short text consists only of the same token twice; the object of the item is not readable (next segment says 'für Klosettdeckel'). |
| p. 25 | Warmwasserspeicher 10 Liter ÜT | Hot water storage heater 10 litres over-sink | Abbreviation 'ÜT' (Übertisch) written out as 'over-sink'. |
| p. 25 | 1/2'' Metallgriffe WÃ¤rmeisoliert [PERSON_159] | 1/2'' metal handles thermally insulated [PERSON_159] | Encoding damage in the source ('WÃ¤rmeisoliert' = 'Wärmeisoliert'); rendered by meaning. Line ends in a token. |
| p. 31 | [PERSON_129] CWS / PARADISE PAPER SLIM | [PERSON_129] CWS / PARADISE PAPER SLIM | No 'oder gleichwertig' after the make, unlike the neighbouring items (e.g. the foam soap dispenser). |
| p. 33 | Ra ? 0,01µm | Ra ? 0,01µm | Comparison sign lost in the source ('?' instead of '<' / '≤'); kept as '?'. |
| p. 34 | [PERSON_129] Geberit / HyTronic/ Art.Nr | [PERSON_129] Geberit / HyTronic/ art. no. | Article number missing after 'Art.Nr'; line breaks off. |
| p. 35 | [PERSON_129] Geberit / Duofix | [PERSON_129] Geberit / Duofix | No article number and no 'oder gleichwertig' / 'gewähltes ...' line, unlike the neighbouring items. |
| p. 36 | Behälterwerkstoff aus Kunstoff | Tank material made of plastc | Misspelling 'Kunstoff' (Kunststoff) rendered with a comparable misspelling. |
| p. 36 | Stufenlose Temperatureinstellung von 35 Grad bis 85 [PERSON_161] | Stepless temperature setting from 35 degrees to 85 [PERSON_161] | Unit after 85 replaced by an anonymisation token. |
| p. 39 | entsprechend den DIN [ORT_016] 1 und DIN [ORT_007] 2 | in accordance with DIN [ORT_016] 1 and DIN [ORT_007] 2 | Standard numbers replaced by anonymisation tokens. |
| p. 39 | Breite: 355 mm, Tiefe: 70 cm | Width: 355 mm, depth: 70 cm | Mixed units (mm / cm) in one line; kept. Also 'Glasur ,' with the glaze name missing (blank before comma), kept. |
| p. 40 | mit UP-Spk. UP320, BF | with concealed cistern UP320, BF | Mounting element names cistern UP320, while the following WC control / rough-in set items (se2663cacc5, s1f725f2863, se24990fddd) refer to Geberit cistern UP300. |
| p. 40 | Rohbauphase einstellbar, 41 - 46cm ... in 8 Positionen, Verstellbereich 45 mm | structural works phase adjustable, 41 - 46cm ... in 8 positions, adjustment range 45 mm | Range 41 - 46cm (50 mm) against stated adjustment range 45 mm; kept. |
| p. 41 | Lagerbock mit geräuscharmen Servomotor | Bearing block with low-noise servomotor | Grammar slip in the source (geräuscharmen instead of geräuscharmem), not reproducible in English. |
| p. 43 | Ausladung 800 mm ... Grifflänge nachträglich in 50 mm Schritten von 800 bis 900 mm verstellbar ... Best.-Nr. 802.50.0180 | projection 800 mm ... grip length subsequently adjustable in 50 mm steps from 800 to 900 mm ... order no. 802.50.0180 | Hinged support rail at the WC has projection 800 mm; the one at the washbasin (s87cac2668c) 600 mm. Not a contradiction as such, recorded for reference. |
| p. 46 | geeignet für zuvor beschreibene Betätigungsplatte | suitable for flush plate descirbed before | Misspelling 'beschreibene' (beschriebene) rendered with a comparable misspelling. |
| p. 46 | Verpackung im Karton<(>,<)> | packaging in cardboard box<(>,<)> | Markup fragment '<(>,<)>' in the source kept as is. |
| p. 46 | geeignet für zuvor beschreibene Betätigungsplatte ... ohne Betätigungsplatte; Fertigbauset Batterie 6V DC | suitable for flush plate descirbed before ... without flush plate; finishing set battery 6V DC | Item is battery-operated (6V DC) while the preceding WC control items are mains-operated with a rough-in mains set; possible overlap / copy from another manufacturer's text (Sanit) inside a Geberit system. Kept. |
| p. 46 | Fabrikat der Planung: Sanit | Make of the design: Sanit | Here 'Fabrikat' is not anonymised (elsewhere [PERSON_129]); make name 'Sanit' without type / article number. |
| p. 47 | Überlaufrohr, Überlaufsicherung, ohne Stopfen, ohne Überlauf ... passend für vorgenannten [PERSON_138] ohne Überlauf | overflow pipe, overflow protection, without plug, without overflow ... matching the aforementioned [PERSON_138] without overflow | Contradiction inside the item: drain and overflow valve with overflow pipe, yet 'without overflow' and for a washbasin without overflow. Kept. |
| p. 47 | paasend zu vorgenannten Ab- und Überlaufventil | matchhing the aforementioned drain and overflow valve | Misspelling 'paasend' (passend) rendered with a comparable misspelling. |
| p. 48 | Einloch-Waschtischbatterie, DN 15 / Einhand-Waschtischbatterie, DN 15 | Single-hole washbasin mixer, DN 15 / Single-lever washbasin mixer, DN 15 | Short text says 'Einloch-', long text (s0a503fd308) says 'Einhand-'; both kept. Long text has no make line, only 'gewähltes [PERSON_129]'. |
| p. 48 | Befsetigungsmaterial | fixnig material | Misspelling 'Befsetigungsmaterial' rendered with a comparable misspelling. |
| p. 48 | [PERSON_129] Geberit / Duofix Art.-Nr.111.480.00.1 | [PERSON_129] Geberit / Duofix art. no.111.480.00.1 | Missing space after 'Art.-Nr.' kept. Different Duofix article number than the washbasin element in the washroom group (111.430.00.1). |
| p. 49 | Stahlkern und Wandplatte aus Polyamid mit | steel core and wall plate of polyamide with | Description breaks off at the end of the segment. |
| p. 50 | gew. [PERSON_129] / gewähltes [PERSON_129] .................... / [PERSON_129] der Planung: Uponor / Contec | selected [PERSON_129] / selected [PERSON_129] .................... / [PERSON_129] of the design: Uponor / Contec | Recurring pattern in this batch: anonymisation tokens replaced ordinary words and damage the sentence. [PERSON_129] stands where a word like 'Fabrikat' belongs (all 'gew. [PERSON_129]' / 'gewähltes [PERSON_129]' / '[PERSON_129] … oder gleichwertig' segments);… |
| p. 51 | Körperschalldämmung für Kunststoff-Abwasserleitungen DN 70 … [PERSON_129] Missel / MSA 9-DN 50 / 161-0070 | Structure-borne sound insulation for plastic wastewater pipes DN 70 … [PERSON_129] Missel / MSA 9-DN 50 / 161-0070 | Product designation says 'MSA 9-DN 50' although the item (short text seafd38a5c0, long text s5ea1b91297) is for DN 70; only the article number ending changes (161-0070). Probable copy-paste leftover from the DN 50 item. Kept. |
| p. 51 | Körperschalldämmung für Kunststoff-Abwasserleitungen DN 100 … [PERSON_129] Missel / MSA 9-DN 50 / 161-0100 | Structure-borne sound insulation for plastic wastewater pipes DN 100 … [PERSON_129] Missel / MSA 9-DN 50 / 161-0100 | Product designation says 'MSA 9-DN 50' although the item (sb9fc8c356a, sa17003373c) is for DN 100. Probable copy-paste leftover. Kept. |
| p. 52 | ..gemäß Anforderungen der Zulassung zur Herstellung der | ..in accordance with the requirements of the approval for producing the | Line starts with two stray dots; the long text of this item is split into fragments in the source. Kept. |
| p. 52 | • vom Deutschen Institute für Bautechnik (DIBt) | • by the German Institutte for Building Technology (DIBt) | Misspelling 'Institute' (Institut) rendered with a comparable misspelling 'Institutte'. |
| p. 52 | Ausführung für Rohr-Ø 57-59 mm DN 58 | Design for pipe Ø 57-59 mm DN 58 | 'DN 58' is not a standard nominal diameter (the following items give DN 80 and DN 110). Also only this item says 'Manschette Außen-Ø', the following ones just 'Außen-Ø'. Kept. |
| p. 54 | Ausführung für Heizungsleitungen, Verteiler, Armaturen, Gefässe | design for heating lines, manifolds, valves, vessels | Item is headed as insulation of drinking water lines (sba92ed2575, 'Dämmung von Trinkwasserleitungen') in a sanitary LV, but the text says design for heating lines; text block 'nicht brennbar … aufzubinden' is also repeated from the preceding segments. Probab… |
| p. 54 | DN 15 bis DN 40: 20 mm DN 50 bis DN 150: 30 mm | DN 15 to DN 40: 20 mm DN 50 to DN 150: 30 mm | The thickness table starts at DN 15, but the following items include DN 12 (s8aee658e6e); the surcharge items for PVC jacketing give 'Dämmstärke bis 30 mm' for DN 25 and DN 32 (s26e3f574c6, sf35c704657) although the insulation items for DN 25 and DN 32 say 20… |
| p. 54 | Nennweitenstärke bei Wärmeleitzahl - 0,035 W/mK, eine NW stärker bei Wärme leitzahl 0,040 W/mK wie aufgeführt. Der Nachweis der Wärmeleitzahl des angebotenen M… | Nominal-diameter thickness at thermal conductivity - 0,035 W/mK, one NW thicker at thermal conduc tivity 0,040 W/mK as listed. Proof of the thermal conductivit… | Word split by a space 'Wärme leitzahl' rendered as 'conduc tivity'; stray dash before 0,035; grammar slip 'des angebotenen Material'; sentence is hard to parse. Building material class given here as A2 while the Conlit / fire items differ. Kept. |
| p. 57 | Rohr DN 12 … Dämmdicke 22,5 mm; DN 15 … 21 mm; DN 20 … 19 mm; DN 25 … 26 mm; DN 32 … 22,5 mm | pipe DN 12 … insulation thickness 22,5 mm; DN 15 … 21 mm; DN 20 … 19 mm; DN 25 … 26 mm; DN 32 … 22,5 mm | Conlit items: insulation thicknesses do not follow the nominal diameter in a consistent way (sf56ae1c6f2, sb170ad740f, s09d60e746c, s22665975c1, s111f1f94ce). Short text s42822af825 begins '[PERSON_074] Deckendurchführung' with the first word tokenised. Value… |
| p. 58 | Der rechnerische Nach- weis der Tragfähigkeit ist auf Verlangen vorzuleghen. | The calculated proof of load-bearing capacity is to be submittted on request. | Misspelling 'vorzuleghen' (vorzulegen) rendered as 'submittted'. |
| p. 59 | Dichtigkeit-Abwasserleitungen | Tightness-wastewater pipes | Odd short text (hyphenated fragment, long text has 'Dichtigkeits-Prüfung'). Rendered literally. |
| p. 59 | Die Prüfungen sind dem AG anzumelden u: gemäß dem Baufortschritt … | The tests are to be notified to the AG a: carried out in partial sections … | Typo 'u:' (for 'u.' = und) rendered as 'a:'. The item is called a tightness test but describes a flushing test ('Spülprobe'). Kept. |
| p. 59 | Wasserentnahme an sieben Entnahmestellen durch ein beauftragten Labors. … die Wasseranalyse an fünf Stellen erneut durchzuführen. | water sampling at seven sampling points by a commissioned laboratory's. … the water analysis is to be carried out again at five points. | Seven sampling points for the first analysis vs five points for the repeat analysis (inconsistent). Grammar slip 'durch ein beauftragten Labors' rendered as 'by a commissioned laboratory's'. Odd legal reference 'RL 98/83 der Trinkwasserverordnung' and 'BGBL.1… |
| p. 60 | in Folie geschweiß oder gerahmt hinter Glas in Heizzentrale anbringen | fit in the heating plant room weldd in film or framed behind glass | Misspelling 'geschweiß' (geschweißt) rendered as 'weldd'. Also: 'Heizzentrale' (heating plant room) in a sanitary LV, probable copy-paste from a heating LV. |
| p. 61 | Dokumentation in Papier- und.. | Documentation in paper and.. | Cut-off section label (ends with '..'). Kept cut. |
| p. 61 | Stundenverrechnugssatz Helfer/Auszubildender | Hourly biling rate helper/apprentice | Misspelling 'Stundenverrechnugssatz' rendered as 'biling'. |
| p. 61 | Summe 13. / 08 Fliesen- und Natursteinarbei.. | Total 13. / 08 Tile and natural stone wor.. | Section totals are numbered differently from the document headers: totals 13.x in LV '08', 9.2 in LV '09', 6.x in LV '12 Dachabdichtung'. Headers s1d4d139e21, s294c3ff64e, s57ecbbf5e1 are cut off in the source ('..'); cut kept. |
| p. 61 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_14a_Betonkernaktivierung.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_14a_Betonkernaktivierung.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | verpreist_2004.. | verpreist_2004.. | Recurring page footer: truncated file name ('verpreist' = priced). Left verbatim as a file name in all occurrences; likewise the file name part '200615_LV_Sanitär' in s34569f1a8a. Unit words in '1,000 Satz' (s8deda57148) and '8,000 Set' (s883be0ac42) left ver… |
| p. 1 | 4. Module und evtl. längere Anbindeleitungen zu den Kühl-/Heizkreisen verbinden … 8. Verteilerdemontage und -wiedermontage an Rohdecke nach Ausschalung (BTA) | 4. Connect modules and possibly longer connection lines to the cooling/heating circuits … 8. Manifold dismantling and reassembly on the bare slab after formwor… | Step 4 names no responsible trade in brackets unlike the other steps; step 8 uses the abbreviation 'BTA' where the other steps write 'Betonkernaktivierung'; step 9 has no trade either. Kept. |
| p. 2 | Bohrungen (nur bei Filigandecken) | drill holes (only with filgree slabs) | Misspelling 'Filigandecken' (Filigrandecken; later 'Filigranplatte') rendered as 'filgree slabs'. |
| p. 3 | - anteilig Schutzrohr,für die Rohrführung | - proportionally protective conduit,for routing the pipe | Missing space after the comma, kept. |
| p. 3 | Kühlfall bei 26°C Raumtemp. = ca. 35 40 W/m² … Heizfall bei 20°C Raumtemp. = ca. 20 25 W/m² | Cooling case at 26°C room temp. = approx. 35 40 W/m² … Heating case at 20°C room temp. = approx. 20 25 W/m² | Range dash lost in the source ('35 40', '20 25'); both lines say '(von oben nach unten)'. Kept with the double space. |
| p. 4 | Fabrikat : Uponor | Make : Uponor | In this and a few other segments (se59c32a874, s0a1c874ab4) the word 'Fabrikat' survived, while elsewhere it is replaced by [PERSON_129]. 'uponor' is lower-case in s0a1c874ab4. The page break lost 'oder gleichwertig' between s1ec4d93c70 and se1a0fdd12a (prese… |
| p. 6 | Velta PE-Xa Rohr sekundärer Anschluss: für zugehöriges Anschlussadapter | Velta PE-Xa pipe secondary connection: for associated connection adapter | Brand 'Velta' named here while the item otherwise specifies Uponor; grammar slip 'zugehöriges Anschlussadapter'. Kept. |
| p. 7 | 8 Heiz-/Kühlkreisen als Einheit für 8 Heizkreise oder, falls beim angebotenen Fabrikat nicht für 9 Kreise verfügbar, aufgeteilt auf 2 Verteiler und 2 Sammler z… | 8 heating/cooling circuits as a unit for 8 heating circuits or, if not available for 9 circuits in the make offered, divided into … | Contradiction: manifold for 8 circuits, but 'nicht für 9 Kreise verfügbar'. The second copy of the same text (s2bb051198e) says 'nicht für 8 Kreise'. Both kept as they are. |
| p. 7 | Heizkreisanschlüsse herstellen, einsch. provisorischer Montage über der [FIRMA_101] beim Betonieren inkl. Demontage und Wiedermontage an Rohdecke | make heating circuit connections, incl. provisional assembly above the [FIRMA_101] during concreting incl. dismantling and reassembly on the bare slab | Abbreviation typo 'einsch.' (einschl.). The second copy of this text (s3f294728b2) ends after 'Heizkreisanschlüsse herstellen' and omits the provisional assembly / dismantling / reassembly. Difference kept. |
| p. 8 | kvs-Wert: 6,4 bzw. 4,8 m3/h. | kvs value: 6,4 or 4,8 m3/h. | Two kvs values for the return valve without saying which applies when; flow valve has 5,4 m3/h. Kept ambiguous. |
| p. 9 | Thermo - Kleinstellantrieb … passend zu zuvor beschriebenem Rücklaufventil | Thermo - small actuator … matching previously described return valve | Actuator specified without make ('gew. [PERSON_129]' only); 'Gewicht kg: 0,073' has the unit before the value. Kept. |
| p. 9 | Bohrungen in der Filigranplatte … je 2 Stück pro Modul/Heizkreis | Drill holes in the filigree slab … 2 pieces each per module/heating circuit | The preliminary text (sadb7afad5a) says drill holes only for Filigran slabs, while s16e4556d9c / the module item describe an in-situ concrete slab with formwork; the items do not say which slab type applies. s3972cc220f says 'pro thermischem Stecker' although… |
| p. 10 | einem Prüfdruck vom 1,3-fachem des Gesamtdruckes an jeder Stelle der Anlage, mindestens aber 1bar Überdruck | a test pressure of 1,3 times the total pressure at every point of the installation, but at least 1bar overpressure | Grammar slip 'vom 1,3-fachem'; '1bar' without space. This test pressure (1,3 times, at least 1bar) stands next to the pressure test at twice the operating pressure, at least 6 bar (s39a61784ea, s2f1432a2d2). s39a61784ea allows filling with '[PERSON_029] oder … |
| p. 14 | Sämtliche eingebrachte Leitungen sind mit [PERSON_029] oder [PERSON_060] zu füllen | All lines installed are to be filled with [PERSON_029] or [PERSON_060] | Recurring pattern in this batch: anonymisation tokens replaced ordinary words / technical terms and damage the sentence ([PERSON_029] in scfc27ee2b2, sc32bd23c61, s2ffd33c970, s1f3e79f9ce; [PERSON_020] and [FIRMA_101] in saa7f0d1b21; [FIRMA_101] also in s51a2… |
| p. 15 | verpreist_2004.. | verpreist_2004.. | Truncated file name in the page header (also 'verpreist_200403_Betonkernaktiv..', 'verpreist_200403_Dachentwässeru..', 'verpreist_200403_Industrieboden..'); recurs throughout the batch. Treated as a name and kept verbatim, including the cut-off. |
| p. 15 | Stundenverrechnugssatz Helfer/Auszubildender | Hourly biling rate helper/apprentice | Misspelling 'Stundenverrechnugssatz' rendered as 'biling'. |
| p. 16 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_14b_Dachentwaesserung.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_14b_Dachentwaesserung.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | verpreist_2004.. | verpreist_2004.. | Recurring page footer: truncated file name ('verpreist' = priced). Left verbatim as a file name in all occurrences; likewise the file name part '200615_LV_Sanitär' in s34569f1a8a. Unit words in '1,000 Satz' (s8deda57148) and '8,000 Set' (s883be0ac42) left ver… |
| p. 1 | Dacheinläufe Hallendach = Liefer- und Leistungsumfang Bau | Roof inlets hall roof = scope of supply and services building construction | The note says the hall-roof inlets are in the building trade's scope, while the same section then specifies roof outlets with accessories (s1f5d3630cd ff.); the source also alternates between 'Dacheinlauf' and 'Dachablauf' for the same part. Rendered 'roof in… |
| p. 1 | Die Dachentwässerung des Objektes soll mit einem | The roof drainage of the building is to be with a | Sentence breaks off (short-text field holds only the first line of the long text). Same pattern in sb641702dd5 ('Der Einbau einer Industrieflächenheizung ist für das'), sc37ee86097 ('Industrieflächenheizung zur individuellen'), s62a0f3f101 / sb6748ac45d (sent… |
| p. 1 | VDI 3806-2000-04, DIN 1986-100, DIN EN 12056). | VDI 3806-2000-04, DIN 1986-100, DIN EN 12056). | Closing bracket without an opening bracket in the source; kept. |
| p. 2 | mit Befefestigungsflansch, für | with fasstening flange, for | Misspelling 'Befefestigungsflansch' (Befestigungsflansch); rendered 'fasstening flange'. |
| p. 2 | Befestgigungsflansch mit Sicherungsmuttern | fastenign flange with lock nuts | Misspelling 'Befestgigungsflansch'; rendered 'fastenign flange'. |
| p. 3 | Begehbare Abdeckung | Walkable cover | Short text says 'Begehbare Abdeckung' (walkable cover), long text (s4b83e7ec08) says 'Ergänzungsset, begehbar' (supplementary set, walkable); both kept as written. |
| p. 9 | passend und als Zubehör beschriebenen Entwässerungssystem. | suitable and as accessory described drainage system. | Word missing in the source ('zum' / 'zu'); the same defective sentence recurs in sd67ef5e2c0, sdda53fe566, s5d174993bf, sbacdce5491 and s53e8dd8030 ('als Zubehör beschriebener Fallrohrschelle'). English left equally incomplete. |
| p. 12 | brennbaren Versorgungsrohren,zur Verhinderung | combustible supply pipes,for preventing | Missing space after the comma; kept. Also: short text (s0136c8aa52) calls the item 'Brandschutz-Dämmmanschette' (insulation collar), long text 'Brandschutzrohrschale' (pipe shell). |
| p. 13 | Stundenverrechnugssatz Helfer/Auszubildender | Hourly biling rate helper/apprentice | Misspelling 'Stundenverrechnugssatz' rendered as 'biling'. |
| p. 13 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | The amount after 'aus' is missing in the source (empty value field); left open. |

## `LV_14c_Industriebodenheizung.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_14c_Industriebodenheizung.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | verpreist_2004.. | verpreist_2004.. | Recurring page footer: truncated file name ('verpreist' = priced). Left verbatim as a file name in all occurrences; likewise the file name part '200615_LV_Sanitär' in s34569f1a8a. Unit words in '1,000 Satz' (s8deda57148) and '8,000 Set' (s883be0ac42) left ver… |
| p. 1 | Max. Betriebsdruck 7,2 bar bei 70°C | Max. operating pressure 7,2 bar at 70°C | Pressure data differ within the section: here 'Anwendungsklasse :4+5 /6 bar' and 'Max. Betriebsdruck 7,2 bar bei 70°C'; the pipe item (se674552e81) says 'max. Betriebsdruck 6 / 10 bar bei +90°C / +70°C'. Also a missing space in 'Verbindungstechnik(wie' and re… |
| p. 2 | Verlegeabstand: 15 mm | Laying spacing: 15 mm | A laying spacing of 15 mm for a 20 x 2 mm pipe is implausible (probably cm); value and unit kept as in the source. |
| p. 3 | Ventil-VoreinstellungAnzeige des Einstellwertes, | valve presettingdisplay of the setting value, | Two words run together without separator in the source; kept run together. |
| p. 3 | - Kreuzstück mit Übergangsverschaubung G - 11/2 flachdichtend, Anschluss für FE-Hahn, - Werkstoff: Glasfaser. Polyamid-max. Betriebstemperatur: 60 °C | - Cross piece with transition screw fiting G - 11/2 flat-sealing, connection for fill/drain cock, - Material: glass fibre. Polyamide-max. operating temperature… | Misspelling 'Übergangsverschaubung' rendered 'screw fiting'. The bullet list is broken in the source: 'G' / '11/2' split over two bullets, 'Glasfaser. Polyamid-max. Betriebstemperatur' runs material and temperature together. The manifold is rated max. 6 bar h… |
| p. 3 | Anzahl Heizgruppen: 11 | Number of heating groups: 11 | Elsewhere in the same item 'Kreise' / 'Heizkreise' (circuits); here 'Heizgruppen' (heating groups). Not harmonised. |
| p. 4 | Materialbedarf: 1 St. / Raum oder größer 50 m² entsprechend mehr Werkstoff: Rundstab Kautschuk | Material requirement: 1 St. / room or greater than 50 m² correspondingly more Material: round rod rubber | Sentence boundary missing before 'Werkstoff:' in the source; kept. The short text (s4be3ce134f) says '100mm', the long text gives a minimum distance of '10 cm'. The marker is for moisture measurement 'im Estrich' although the section is an industrial floor he… |
| p. 5 | Fußodenschichten | foor layers | Misspelling 'Fußodenschichten' (Fußbodenschichten); rendered 'foor layers'. Test pressure here 'mindestens jedoch 10 bar'; the parallel text for the component activation (scfc27ee2b2) says 'mindestens jedoch 6 bar' (different section, noted only). |
| p. 6 | Stundenverrechnugssatz Helfer/Auszubildender | Hourly biling rate helper/apprentice | Misspelling 'Stundenverrechnugssatz' rendered as 'biling'. |
| p. 6 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | The amount after 'aus' is missing in the source (empty value field); left open. |

## `LV_15_Abdichtung_Aussenwaende.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_15_Abdichtung_Aussenwaende.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | genegen huminöse Salze auf WU-Betonwänden | aganist huminous salts on waterproof concrete walls | Misspelling 'genegen' (gegen) rendered 'aganist'; unusual wording 'huminöse Salze' rendered 'huminous salts'. |
| p. 1 | aus Polystryrol-Hartschaum XPS | of polystryrene rigid foam XPS | Misspelling 'Polystryrol' rendered 'polystryrene'. Thermal conductivity '0,036' has no unit. The short text (s65ff9cd3fc) says '14 cm, einbauen', the long text '140 mm' and 'befestigen', followed by 'Dämmung bauseits.' (s98c873a90a): insulation material provi… |
| p. 2 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_15a_Abdichtung_Bodenplatte_Buero.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_15a_Abdichtung_Bodenplatte_Buero.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | an die Bodenabläufen anarbeiten und abdichten. | work the waterproofing up to the floor outlets and seal | Grammar slip in the source ('an die Bodenabläufen'); the item text speaks of 'PVC-Grundrohren' and then of 'Bodenabläufen', while the preceding item (s4db5dcf028) calls them 'Bodeneinläufen'. Not harmonised (floor outlets / floor inlets). |
| p. 2 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_17_Trockenbau.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_17_Trockenbau.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 2 | inkl. erfoderlicher U/A-Profile | incl. reqired U/A profiles | Misspelling 'erfoderlicher' (erforderlicher) rendered 'reqired'; recurs in sb3906e28fb and s45fcd60f38. |
| p. 4 | Herstellen von Brüstungs-GK Verkleidung, 2lg | Produce parapet plasterboard cladding, 2-layer | Long text (s123542be37) describes the parapet cladding as 'Metallständerwand mit verzinktem Einfachständerwerk und Mineralwolledämmung' (apparent copy-paste from the stud wall items), with missing space in 'Mineralwolledämmung,einschl.' and no punctuation bet… |
| p. 4 | UG-2.OGBrüstungsbereich Fassade | Basement-2nd upper floorparapet area facade | Two values run together without a space in the source; kept run together. |
| p. 4 | Metallständerwänden (W112) mit d=125 mm : > 10 mm | metal stud walls (W112) with d=125 mm : > 10 mm | Fragment ': > 10 mm' without a label (presumably the deflection to be accommodated); same in se3e87739e1 with d=175 mm. Kept unexplained. |
| p. 5 | A gem. DIN 4109 | A acc. to DIN 4109 | Value for 'Brandschutz: / Baustoffklasse:' cites DIN 4109, which is the sound insulation standard, not the building material class standard; kept as written. Only one value is given for the two labels (sc22213a842). |
| p. 5 | Heizkörpern, etc, | radiators, etc, | Text ends with a comma; short text (s43c1b4e9b2) says 'Verstärkung für Hängeschränke' while the long text describes 'Holzdielen ... als Zulage'. Kept. |
| p. 6 | Fassadenanschluss als Schwert mit Metall-UK | Facade connection as blade with metal substructure | 'UK' here means Unterkonstruktion (substructure), not Unterkante; translated by meaning throughout the drywall items. Board-type codes GK, GKB, GKF, GKI and insulation codes TSD, WD, FBH, WLS, WLG, OTS, PZ, TRH, OKR, OKF are kept as codes. |
| p. 6 | Rw, R= bis 50 dB | Rw, R= up to 50 dB | Odd notation 'Rw, R=' (the other items write 'Rw, R bis'); kept. |
| p. 6 | Plattentyp GM-F gem. EN 15283-1, 1-mal 15 | Board type GM-F acc. to EN 15283-1, 1 time 15 | Value ends without unit; the unit 'mm, beidseitig' sits in the label segment s412c71ddda (table layout of the PDF). Kept as is. |
| p. 7 | [FIRMA_095] und Öffnungen; [FIRMA_101] sichtb.UK; [FIRMA_071] auf TSD/WD,CT, 65mm; [PERSON_169] mit unterschiedlichen Oberbelägen; [PERSON_089] feuerverzinkt; … | [FIRMA_095] and openings; [FIRMA_101] visible substructure; [FIRMA_071] on TSD/WD,CT, 65mm; [PERSON_169] with different top coverings; [PERSON_089] hot-dip gal… | Recurring pattern: anonymisation tokens replaced ordinary nouns (apparently doors, ceiling, cement screed, screed areas, steel, type, shower, material names, also standards as [ORT_032]/[ORT_033]), which leaves sentences and short texts without their subject.… |
| p. 9 | Aussparung,40x40cm,F0,rechteckig / wie Pos. vor, jedoch 30x30cm | Recess,40x40cm,F0,rectangular / as previous item, but 30x30cm | Contradiction: short text (sa60a320808) says 40x40cm, long text says 30x30cm (copy-paste from the previous item). Kept. |
| p. 9 | der erfoderlichen Rahmenverstärkungen | the requried frame reinforcements | Misspelling 'erfoderlichen' (erforderlichen), rendered with a comparable misspelling. Recurs in sef91d88073, s7705c2c239, sa5664e8d5a. |
| p. 10 | Brandschutz: keine Anfoderungen | Fire protection: no requirments | Misspelling 'Anfoderungen' (Anforderungen). Recurs in s61c60f8fbf, sae3565b9c8. |
| p. 10 | Rundlöcher in Ständerwand bis DN 50mm / bis DN 30 mm. | Round holes in stud wall up to DN 50mm / up to DN 30 mm. | Contradiction: short text (s4605bb2fb8) says up to DN 50mm, long text up to DN 30 mm. Kept. |
| p. 11 | über DN 50 mm bis DN 150 mm / über DN 50 bis DN 100 mm. | over DN 50 mm up to DN 150 mm / over DN 50 up to DN 100 mm. | Contradiction: short text (s6a5658ebd8) says up to DN 150 mm, long text up to DN 100 mm. Kept. |
| p. 11 | sichtb.UK,stumpfe | vis. substructure,butt | UK here means Unterkonstruktion (substructure), not Unterkante, so it was translated by meaning; short text is cut off after 'stumpfe'. |
| p. 12 | für die Verwendung von feuchtigkeitsbeständige Platten | for the use of moisture-resistant boards | Grammar slip in the source (wrong case ending), not reproducible in English; meaning unchanged. Similar: 'mit höhergeführten Beschlag' in s4fbe93d6f0, 'Kabelkanälen' in sb2f2c47d7b. |
| p. 13 | Vertikaler Deckensprung im Eingansbereich | Vertical ceiling step in the entrace area | Misspelling 'Eingansbereich' (Eingangsbereich). |
| p. 14 | Aussparung, rund, bis ca. 500 mm Durchmesser / Durchmesser bis ca. 250-500 mm | Recess, round, up to approx. 500 mm diameter / diameter up to approx. 250-500 mm | Long text says 'up to approx. 250-500 mm' (a range after 'up to'), short text (s95f850f011) 'up to approx. 500 mm'. Kept. |
| p. 15 | 17 Trockenbau / Summe 10.1. ... Summe 11.1. | 17 Drywall construction / Total 10.1. ... Total 11.1. | Section totals are numbered 10.x under the heading '17 Trockenbau' and 11.x under '18 Estrich', and 'Summe 11.1.' appears directly after the heading 'Estricharbeiten' with no 11.2 total in the batch. Numbering kept as found. |
| p. 16 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

Text boxes where the English had to be shrunk below 72 % of the original size (1):

- p. 8, scale 0.67: Subsequent work (by others on site)

## `LV_18_Estrich.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_18_Estrich.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 3 | im Beerich von Bodeneinläufen | in the aera of floor drains | Misspelling 'Beerich' (Bereich). |
| p. 4 | inkl Reinigung der Betonoberfläche | incl cleaning of the concrete surface | 'inkl' without full stop, kept as 'incl'. Recurs in sec16ec9fee. |
| p. 7 | an Bodentanks.. | to floor boxes.. | Double full stop in the source, kept. |
| p. 7 | UGSchulungs- und Besürechungsraum, Teeküche | Basementtraining and meetnig room, tea kitchen | Missing space after 'UG' and misspelling 'Besürechungsraum' (Besprechungsraum); both kept. |
| p. 8 | Büros, Besprecungsräume | offices, meetng rooms | Misspelling 'Besprecungsräume'. |
| p. 10 | Aussparung Sauberlaufrmatte ... Einbau einer Sauberlaufmnatte | Recess entrance mmat ... installation by others on site of an entrance mnat | Two different misspellings of 'Sauberlaufmatte' in the same item, rendered with comparable misspellings. Dimensions given as 1000 x 1800 mm in the first line and 1800x1000 mm (b x t) below; kept. |
| p. 14 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

Text boxes where the English had to be shrunk below 72 % of the original size (4):

- p. 4, scale 0.7: Preceding work (by others on site):
- p. 7, scale 0.7: Preceding work (by others on site):
- p. 10, scale 0.7: Preceding work (by others on site):
- p. 12, scale 0.7: Preceding work (by others on site):

## `LV_19_Sektionaltore_Stahltueren.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_19_Sektionaltore_Stahltueren.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | Verschiedene Produkte innerhalb eines Systems dür fen nicht vermischt bzw. Verwendet werden | Different products within a system must not be mixed or Used | Word broken at line end without hyphen ('dür / fen'), double space and stray capital 'Verwendet'; capital and double space kept. |
| p. 1 | Seine Leistungen notwendig/erforderlich sind | His work are necessary/required | Sentence runs over s8c47d333dd and s2271834c32 with a stray capital 'Seine' mid-sentence; English sentence spread over the same two segments ('Der NU/AN hat' moved into the second). Same split for s38b620b436 / s1c180357b8, where the source writes 'AN/NU' ins… |
| p. 1 | - Verschmutzte Fremdbauteile (z. B. [PERSON_074] | - Soiled components of others (e.g. [PERSON_074] | Segment breaks off after the token (bracket not closed) at the end of the batch. |
| p. 1 | TGA-Ausrüstung/Austattung ... Der NU/AN hat sorge zu tragen, das auf den von Ihm benutzten Fremdflächen, täglich alle [PERSON_010] | building services equipment/fitings ... The NU/AN has to take care, that on the third-party areas used by Him, daily all [PERSON_010] | Segment starts in mid-sentence (unbalanced closing bracket) and breaks off after the token [PERSON_010]. Misspelling 'Austattung'; 'das' for 'dass', lower-case 'sorge', capitalised 'Ihm'. [PERSON_047] and [PERSON_010] replaced ordinary nouns (probably waste /… |
| p. 2 | zur Funktionstüchtigkeit der Gesamtleistung erforderlich sind, sind in die Jeweilige Grundposition mit einzukalkulieren. | are required for the functionality of the overall work, are to be included in the price of the Respective base item. | Segment starts in mid-sentence; its beginning is not in the batch. Wrong capital in 'Jeweilige' kept as 'Respective'. |
| p. 2 | Sectionaltor, herstellen, liefern | Sectionnal door, produce, supply | 'Sectionaltor' spelled with c, elsewhere 'Sektionaltor'; rendered with a deviating spelling. |
| p. 3 | Stahltürlement ... Umfasungs-/Eckzarge | Steel door elment ... wrap-arround/corner frame | Two misspellings (Stahltürelement, Umfassungszarge), rendered with comparable misspellings. Same in s674282074b. |
| p. 3 | Beschlagsteile und Türgriffgarni-- turen, etc. aus [PERSON_115] | Fitting parts and door handle se-- ts, etc. of [PERSON_115] | Word broken with a double hyphen at the line end; kept. Material name replaced by [PERSON_115]. Recurs in s60a9c52978, s4a6783fd73. |
| p. 4 | T 30 RS - Stahltürelement, 1260 x 2135 mm / ca. 1010 x 2135 mm (Rohbauöffnung) | T 30 RS - steel door element, 1260 x 2135 mm / approx. 1010 x 2135 mm (structural opening) | Contradiction: short text says 1260 x 2135 mm, the size line that follows in the long text (sd98d8ebb27) says approx. 1010 x 2135 mm, which is the size of the next item. Kept. |
| p. 7 | auf gegen- seitigkeit. | on a reciprocal basis. | Lower-case 'gegenseitigkeit' hyphenated across the line; wording is odd for hourly-rate work (probably 'auf Nachweis' intended). Translated literally. Recurs in sc9f7ad851a. |
| p. 8 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_20_Bodenbelagsarbeiten.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_20_Bodenbelagsarbeiten.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 3 | Brandstoffklasse schwer entflammbar | fuel material class flame-retardant | 'Brandstoffklasse' is an odd word (presumably Baustoffklasse, building material class); rendered literally, not corrected. |
| p. 4 | Oberflächenfertige Laminate ... / Laminatböden ... DIN EN 13329 | Surface-finished laminates ... / Laminate floors ... DIN EN 13329 | Preliminary remarks of a PVC floor covering LV contain rules for laminate, wood skirtings, carpet skirtings - boilerplate not matching the LV content. |
| p. 4 | 3.4 Abschlüsse: Sockelleisten sollen ... / 3.5 Sockelleisten | 3.4 Terminations: Skirting boards shall ... / 3.5 Skirting boards | A skirting board paragraph stands under 3.4 before the heading 3.5 Skirting boards. |
| p. 4 | Als Schrauben sind, soweit nicht an anderer Stelle abweichend beschrieben, [PERSON_176] | As screws, unless described otherwise elsewhere, [PERSON_176] | Recurring pattern in this batch: anonymisation tokens replaced ordinary nouns and damage the sentences ([PERSON_176], [PERSON_016], [PERSON_010], [PERSON_129], [PERSON_119], [FIRMA_095], [PERSON_074], [PERSON_029], [PERSON_125], [TELEFON_036] as a slab width,… |
| p. 5 | Bodenbeschichtungsauswahl | floor coating selection | Speaks of floor coating in a floor covering LV; kept. |
| p. 5 | gilt R10 als mindestens geschuldete Anforderung | R10 applies as the minimum requirement owed | Preliminary remarks set R10 as minimum, but item s4804b69319 / sfd2182746f specifies R9 and R10 is only a surcharge item (s053b43e04a). Contradiction kept. |
| p. 5 | geringstrukturierter Oberböden ... langer, vor Kopfbelichteter Flure | low-texture top floorings ... of long, End-lit corridors | "Oberböden" used for top floor coverings (not topsoil); "vor Kopfbelichteter" is wrongly split/capitalised (vorkopfbelichteter) and the genitive hangs loosely in the sentence; rendered with a comparable odd capital. |
| p. 7 | Dampfbremse / wasserdampfdicht / ggf. Dampfsperre | Vapour retarder / water-vapour-tight / if applicable vapour barrier | Item is called vapour retarder (Dampfbremse) but required to be water-vapour-tight; the next item calls it vapour barrier (Dampfsperre). Kept. |
| p. 8 | Trittschallverbgs.-maß: | Impact sound improvmt. index: | Unusual abbreviation of Trittschallverbesserungsmaß; rendered abbreviated. The label list also contains a stray value line "EN 425" and a token [PERSON_016] as a label. |
| p. 8 | Herstellung eine ableitfähigen Bodenbelags | production of an conductive floor covering | Grammar slip (eine instead of eines), rendered with a comparable slip. |
| p. 8 | Zweck: von | Purpose: of | Stray word "von" among labels; it belongs to the value text split over the next segments ("Räume mit Nutzung" / "von" / "elektronischen/fernmeldetechnischen Bauteilen"). Left in place. |
| p. 9 | H=ca. 8cm / 8 cm | H=approx. 8cm / 8 cm | Short text 'approx. 8cm', value list (s947b4d5488) '8 cm'. Kept. |
| p. 9 | Ersteinpflege des zuvor beschriebenen Bodenbelag aus PVC. | Initial care treatment of the previously described floor covering of PVC. | The preceding items describe the covering as vinyl ("Bodenbelag aus Vinyl"); here and in the following segments it is called PVC. Left as is. |
| p. 9 | für Bodenbelag aus PVC ohne werkseitiges | for floor covering of PVC without factory-applied | Sentence breaks off after "werkseitiges". |
| p. 10 | Farbe nach [PERSON_125] des AN aus dem Standardprogramm. | Colour at the [PERSON_125] of the AN from the standard range. | Here the colour choice lies with the AN (contractor), whereas the other items of the batch say 'nach [PERSON_125] des AG'. Possibly an error in the source, kept. |
| p. 10 | Vollflächigkleben mit lösemittelfreiem ... / emissionsarmem Dispersionsklebstoff nach Hersteller-empfehlung. | Full-surfacebonding with solvent-free ... / low-emission dispersion adhesive according to manufacturer-recommendation. | Missing space in 'Vollflächigkleben' and stray hyphen in 'Hersteller-empfehlung' (sdc94619b24), mirrored. The sentence is split over two non-adjacent-looking segments. |
| p. 11 | ca. 2-7 mm, entsprechend / Belagstärke | approx. 2-7 mm, according to / Covering thickness | Value breaks off after 'entsprechend' (continues in label sc230143245 'Belagstärke' by column extraction). Profile height 2-7 mm for a 2 mm covering. |
| p. 12 | Summe 14.3. | Total 14.3. | Section totals are numbered 14.3. / 14.4. while the trade heading is "20 Bodenbelagsarbeiten"; likewise "Summe 13.4." (s06283bf0da) under "21 Natursteinarbeiten". Numbering mismatch kept. |
| p. 13 | [PERSON_129] wie zurvor beschriebener Teppichbodenbelag | [PERSON_129] as pevriously described carpet floor covering | Misspelling 'zurvor' (zuvor), rendered with a comparable misspelling. |
| p. 13 | Sockel, Kugelgarn, h= ca. 6cm / ca. 60 mm | skirting, Kugelgarn, h= approx. 6cm / approx. 60 mm | 'Kugelgarn' kept as product name (Fabramont Kugelgarn RESISTA, s4fe3e7f195). Note the source writes 'Fabramont'. |
| p. 13 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

Text boxes where the English had to be shrunk below 72 % of the original size (1):

- p. 8, scale 0.66: Subsequent work (by others on site):

## `LV_21_Natursteinarbeiten.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_21_Natursteinarbeiten.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | auf gegen- seitigkeit. | on a reciprocal basis. | Lower-case 'gegenseitigkeit' hyphenated across the line; wording is odd for hourly-rate work (probably 'auf Nachweis' intended). Translated literally. Recurs in sc9f7ad851a. |
| p. 2 | Verschiedene Produkte innerhalb eines Systems dür fen nicht vermischt bzw. Verwendet werden | Different products within a system must not be mixed or Used | Word broken at line end without hyphen ('dür / fen'), double space and stray capital 'Verwendet'; capital and double space kept. |
| p. 2 | seine Leistungen notwendig/erforderlich sind, wie z. B. Fahrzeuge ... etc.,in seine Einheitspreise | are necessary/required for his work, such as e.g. vehicles ... etc.,to be included in his unit prices | Segment starts in the middle of a sentence (beginning missing); missing space after "etc.," and stray space before a comma kept. |
| p. 2 | - Verschmutzte Fremdbauteile (z. B. [PERSON_074] | - Soiled components of others (e.g. [PERSON_074] | Segment breaks off after the token (bracket not closed) at the end of the batch. |
| p. 2 | TGA-Ausrüstung/Austattung ... Der NU/AN hat sorge zu tragen, das auf den von Ihm benutzten Fremdflächen, täglich alle [PERSON_010] | building services equipment/fitings ... The NU/AN has to take care, that on the third-party areas used by Him, daily all [PERSON_010] | Segment starts in mid-sentence (unbalanced closing bracket) and breaks off after the token [PERSON_010]. Misspelling 'Austattung'; 'das' for 'dass', lower-case 'sorge', capitalised 'Ihm'. [PERSON_047] and [PERSON_010] replaced ordinary nouns (probably waste /… |
| p. 3 | zur Funktionstüchtigkeit der Gesamtleistung erforderlich sind, sind in die Jeweilige Grundposition mit einzukalkulieren. | are required for the functionality of the overall work, are to be included in the price of the Respective base item. | Segment starts in mid-sentence; its beginning is not in the batch. Wrong capital in 'Jeweilige' kept as 'Respective'. |
| p. 3 | Sämtlichste verwendete Materialien | Allest materials used | Non-existent superlative "Sämtlichste"; rendered with a comparable malformed word. "Verfärbungs-/Ausblühungsfrei" is wrongly capitalised in the source. |
| p. 4 | Stufenrandsockel ... Stgv.: ca. 16,5 x 28,0 cm Überstand Trittstufe -vorn-: 2 cm | Stair edge skirting ... Rise/going: approx. 16,5 x 28,0 cm Tread overhang -front-: 2 cm | "der dauerelastischer Verfugung" is a grammar slip; "Stgv." (Steigungsverhältnis) is an unusual abbreviation, rendered "Rise/going". |
| p. 7 | Mörteldicke: ca. 30 mm Farbe Verfugung: dunkelgrau Mörteldicke: ca. 30 mm | Mortar thickness: approx. 30 mm Colour of jointing: dark grey Mortar thickness: approx. 30 mm | Line "Mörteldicke: ca. 30 mm" appears twice (copy-paste leftover); slab width replaced by token [TELEFON_036]. |
| p. 7 | Material: wieBodenbelag | Material: asfloor covering | Missing space, rendered with missing space. |
| p. 8 | dem Einbau der bauseitig gelieferte Sauberlaufzone ... und dem Verlegen Bodenbelag der Hauptposition | the installation of the entrance matting zone ... supplied by others on site ... and the laying floor covering of the main item | Grammar slips in the source (case endings, missing "des"); the missing word is not supplied in English. |
| p. 9 | Zementschleientferner | cement fim remover | Misspelling of Zementschleierentferner, rendered with a comparable misspelling. The sentence continues in fragments over the following segments. |
| p. 9 | Dauerelastischer Verfugung | Permanently elastic jointing | Wrong case ending in the heading and in the long text (Dauerelastischer instead of Dauerelastische); not reproducible in English. |
| p. 9 | leicht spritzbar und gutglättbar ... bei Dehn-und Stauchbewegungen | easy to gun and readilysmoothable ... under stretching-and compression movements | Missing spaces ("gutglättbar", "Dehn-und") rendered with comparable missing spaces; the list of connections consists only of three identical tokens [PERSON_074]. |
| p. 11 | Summe 13. / 08 Fliesen- und Natursteinarbei.. | Total 13. / 08 Tile and natural stone wor.. | Section totals are numbered differently from the document headers: totals 13.x in LV '08', 9.2 in LV '09', 6.x in LV '12 Dachabdichtung'. Headers s1d4d139e21, s294c3ff64e, s57ecbbf5e1 are cut off in the source ('..'); cut kept. |
| p. 11 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_22_Schreinerarbeiten.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_22_Schreinerarbeiten.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 3 | Fluchtürterminals ... Glasstärken, -arten und -zwischenlagern ... Ausschnitte Steckdosen ... Ebenengleiche | escap door terminals ... glass thicknesses, types and interlayrs ... cut-outs sockets ... Level-flush | Misspelling "Fluchtürterminals" (Fluchttürterminals); "-zwischenlagern" presumably meant -zwischenlagen; comma missing between "Ausschnitte" and "Steckdosen"; "Ebenengleiche" wrongly capitalised. All rendered comparably. |
| p. 4 | mit überdeckten Hartholzleimern | with covered hardwood lippings | "Hartholzleimern" / "Kunststoffleimern" (s933f00d295) presumably meant Anleimer (lippings), which the next paragraph uses; translated as lippings. |
| p. 5 | sind grundsätzlich als vorgezogene Leistung zu | are as a rule, as advance work, at | Sentence fragment without subject (the subject was lost before this segment); continues in s5dabcbf436. |
| p. 5 | [PERSON_119] bis zu einer Länge von 3,00 m sind ungeteilt einzubauen, längere Fensterbänke sind | [PERSON_119] up to a length of 3,00 m are to be installed undivided, longer window sills are to be divided with | Token [PERSON_119] replaces the subject in several sentences while "Fensterbänke" survives in the same sentence. |
| p. 6 | Vorgabehöhe 850 mm aus DIN 18040 | specified height 850 mm from DIN 18040 | Same sentence appears earlier (s1b049bd3ac) with "DIN 18040-2 Tabelle 1"; here only "DIN 18040". Repeated paragraph with differing reference, kept. |
| p. 6 | Sind in Tür- oder Fensterlisten sowie Glasstärken in der Leistungsbeschreibung benannt | If in door or window schedules as well as glass thicknesses are named in the description of work | Repeat of sd1c3519dce with a stray "in" that breaks the grammar; kept broken. |
| p. 7 | Unterschnitte zur Nachströmung gemäß Prüfzeugnis oder bauaufsichtlicher Zulassung unter Brandschutztüren sind unzulässig. | Undercuts for make-up air according to test certificate or building authority approval under fire doors are not permitted. | Ambiguous / odd statement (undercuts according to certificate are declared not permitted); kept as written. |
| p. 7 | und Brandschutztüren sind generell als geprüfte Einheit aus | and fire doors are generally to be executed as a tested unit of | Sentence starts with "und"; its beginning was replaced by token [PERSON_041] in the heading segment before. Similar: s34465e04cb after [PERSON_109]. |
| p. 8 | "ständig geschlossen", falls nicht beschrieben oder in den Planungsunterlagen ersichtlich. | "permanently closed", unless described or apparent in the planning documents. | Elliptical: presumably "falls nicht anders beschrieben"; the missing word is not supplied. |
| p. 9 | auf der Innenseite der Fassade (nicht außenseitig, also Über-Kopf-Montage) | on the inside of the facade (not on the outside, i.e. overhead assembly) | Parenthesis is ambiguous as to what "Über-Kopf-Montage" refers to; kept ambiguous. |
| p. 10 | Zuleitung unter Putz für Taster, Taster AG (Elektrogewerk) | Supply line flush-mounted for push-button, push-button AG (electrical trade) | "Taster" repeated; abbreviations RMZ, GLS, FSA, BMA used as codes and kept. |
| p. 10 | 3.3.8 Kraftbetätigte [FIRMA_095] | 3.3.8 Power-operated [FIRMA_095] | Recurring pattern: an ordinary noun (apparently the word for doors) was replaced by the token [FIRMA_095] throughout section 3.3.8/3.3.9 and in 'Wände / [FIRMA_095]'; token kept, sentences are damaged. |
| p. 12 | [PERSON_129] 1 Innenfensterbank,MDF/HPL,30x195mm | [PERSON_129] 1 Interior window sill,MDF/HPL,30x195mm | Recurring pattern: [PERSON_129] replaces an ordinary word in item headings ('[PERSON_129] 1', '2', '2a', '3') and in 'Angebotenes [PERSON_129] ....' (s3bde29cdf8); token kept. |
| p. 13 | Einbauort: Büros, EG-2.OG siehe Plan | Installation location: offices, ground floor-2nd floor see drawing | Translator's choice, not a source error: floor abbreviations UG/EG/OG were translated (basement / ground floor / 1st, 2nd floor) throughout the batch; 'EG-1OG' in s04cd98e895 lacks the dot in the source. |
| p. 14 | Austritt Terasse d=30 | Step-out terace d=30 | Misspelling 'Terasse' (Terrasse), also 'Terassenaustritt' in sa33ad3cad9 and sc345d922b4; rendered 'terace'. |
| p. 14 | in Anlehung an Küchendesign | in keepng with kitchen design | Misspelling 'Anlehung' (Anlehnung); rendered 'keepng'. |
| p. 16 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

## `LV_23_Sanitaertrennwaende.pdf`

German original: `dataset/03_pdf_hochbau_projekt/LV_23_Sanitaertrennwaende.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | [ADRESSE_007] ž[ORT_026] | [ADRESSE_007] ž[ORT_026] | Stray character 'ž' (mis-decoded separator) in the letterhead, kept. |
| p. 1 | System durch U-Profile [PERSON_115] über gesamte Elementhöhe unsichtbar an [PERSON_074] befestigt. | System fixed invisibly to [PERSON_074] by U-profiles [PERSON_115] over the entire element height. | Recurring pattern: [PERSON_074] and [PERSON_115] replace ordinary words (probably wall / a material or finish) in the partition items and in 'Einbau bündig mit [PERSON_074] Bänder nicht sichtbar' (sf7f3c7bc81); tokens kept. |
| p. 1 | direktbeschichtete Vollplanplatte | directly coated solid chipoard | Misspelling 'Vollplanplatte' (short text says 'Vollspanpl.'), repeated in s64a1e943d6; rendered 'chipoard'. |
| p. 1 | Oberfäche: | Surfce: | Misspelling (Oberfläche), rendered with a comparable misspelling. Recurs in s94aba6698c and s476d0257c1. |
| p. 3 | Duschtrennw. T-Form,HPL,Vollkern,90x200cm, T=60cm | Shower partit. T-shape,HPL,solid core,90x200cm, T=60cm | Short text gives T=60cm, the long text value (s430f17fe2a) gives 'T=60x200cm'; the long text also calls the item a 'Sichtschutzwand' in the system of the WC partition (melamine chipboard) while material is HPL solid core. Left as is. |
| p. 3 | raumatte Oberflächenstruktur | roughmatt surface texture | Odd word 'raumatte' (probably 'raue, matte' or a typo); rendered as run-together 'roughmatt'. |
| p. 4 | Summe 16.1. | Total 16.1. | Total line refers to '16.1.' while the surrounding sections are numbered 22 (Schreinerarbeiten) and 23 (Sanitärtrennwände); numbering inconsistency left as is. |
| p. 4 | Zuzüglich der gesetzlichen Mehrwertsteuer aus in Höhe von 19,00 % | Plus the statutory VAT on at the rate of 19,00 % | Amount after 'aus' is blank (fill-in), sentence left open. |

Text boxes where the English had to be shrunk below 72 % of the original size (3):

- p. 2, scale 0.61: Ground floor -
- p. 2, scale 0.61: Ground floor -
- p. 3, scale 0.61: Ground floor -
