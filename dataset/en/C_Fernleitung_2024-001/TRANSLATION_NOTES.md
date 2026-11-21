# Translation notes — project C

Source defects noticed in the files of this project and how they were carried over. What applies to all files is in `../TRANSLATION_NOTES.md`.

## `LV-Positionen.docx`

German original: `dataset/05_positionslisten/LV-Positionen.docx`

| Where | German original | English rendering | Note |
|---|---|---|---|
| paragraph | 1.1.10 – Baustelleneinrichtung [psch] | 1.1.10 - Site setup [psch] | En dash of the source written as hyphen (plain-character rule) throughout the measurement list; unit codes in brackets kept ([Mt.], [St.]). |
| paragraph | Steuerkabelverlegung (bei DN 300) | Laying of control cable (for DN 300) | Heading names DN 300, all pipe items in this list are DN 250. Kept. |
| paragraph | aufsetzten | putt on | Misspelling of aufsetzen, rendered with a comparable misspelling. |

## `Angebot AN24-0305.D84`

German original: `dataset/02_gaeb_90/Angebot AN24-0305.D84`

| Where | German original | English rendering | Note |
|---|---|---|---|
| 01 project name | WV [ORT_0000009], FWL [ORT_0000009] - We | WV [ORT_0000009], FWL [ORT_0000009] - We | Project label of codes and tokens, cut off after 'We' (40-character field). Nothing translatable; returned unchanged. |
| OZ 1 1 170 (long text) | Be-weissicherungsverfahren / Be- endigung / befahren- den / Baustellenein- richtung / Güte- überwachung | preservation of evidence procedure / completion / to be used / site setup / quality monitoring | Recurring pattern: words carry stray hyphens from former line breaks. Translated as the intact word, no hyphen artefact reproduced. |
| OZ 1 1 170 (long text) | durch nachfolgen Positionen | by followin items | 'nachfolgen' instead of 'nachfolgende', rendered with a truncated word. |
| OZ 2 1 480 (long text) | Notrstromversorgung | emergncy power supply | Misspelling, rendered with a misspelling. |
| OZ 2 1 480 (long text) | Die ggf. erforderlich werdende Reinigung ... sind vom AN ... auszuführen | The cleaning ... that may become necessary ... are to be carried out by the AN | Singular subject with plural verb in the source; kept. |
| OZ 2 4  30 (long text) | Stundenlohnarbeiten für Oberbodenabtrag bzw. Stundenlohnarbeiten für Oberbodenabtrag bzw. Bodenaushub nach Angabe des Archäologen | Hourly-rate work for topsoil stripping or Hourly-rate work for topsoil stripping or soil excavation as specified by the archaeologist | First line is repeated (short text cut, then full text). Several '@@' segments repeat their heading the same way (s298a044f9a, s3471c0704f, s8c5e72985d, s79507d9e76). Kept. |
| OZ 3 1 100 (long text) | Baufortschriftt | construction progresss | Misspelling, rendered with a misspelling. |
| OZ 3 1 100 (long text) | gem. ZTV-Wa gem. entsprechender Position | acc. to ZTV-Wa acc. to the corresponding item | Doubled 'gem.'; kept. Spelling 'ZTV-Wa' here versus 'ZTV-WA' in s6ffe0e5e3e. |
| OZ 4 1 320 (long text) | ausnahmlich der [ORT_00030] | with the exeption of the [ORT_00030] | 'ausnahmlich' is not a correct word (for 'ausnahmlich/ausgenommen'); rendered with a misspelling. A token replaces the noun. |
| OZ 4 1 320 (long text) | nicht gröer als 15 km | not greter than 15 km | Misspelling of 'größer', rendered with a misspelling. The sentence ends with 'aus dem Lieferwerk:' and no plant is named. |
| OZ 5 1 110 (long text) | C20/ 25 | C20/ 25 | Concrete class written inconsistently ('C 20/25', 'C 20/ 25', 'C20/ 25') across neighbouring segments; spacing kept. |
| OZ 5 1 110 (long text) | mind 30 mm | min 30 mm | Missing full stop after 'mind'; kept. |
| OZ 5 1 110 (long text) | mit stabilen Scharnieren, verdeckt liegenden angeordnet | with sturdy hinges, arranged concealed | Ungrammatical in the source ('liegenden'). The cover is headed 'EDELSTAHLDECKEL' while the material in the text is the token PER000115. A full stop is missing between 'Gasdruckfedern' and 'Schachtabdeckung und Rahmen'; kept without one. |
| OZ 5 1 110 (long text) | Fabrikat: FIRMA_062 o. glw. Bauart | make: FIRMA_062 or equivalent design | Company token written 'FIRMA_062' here and 'FIR62' in neighbouring segments; both kept. 'OK des Entlüftungsrohres auf Höhe Entlüftungsrohr-OK des Schachtdeckels' is garbled in the source and translated literally. |
| OZ 5 1 110 (long text) | Leiter mit ausklappbarer Einhaltung | Ladder with fold-out holding device | 'Einhaltung' (compliance) makes no sense here, probably meant a holding / access device; also in s1833ed640c. Rendered by the apparent meaning, uncertain. |
| OZ 5 2  70 (long text) | ZTV-WA PERSON_027ßrohre | ZTV-WA PERSON_027ß pipes | Token replaced the beginning of a word and left 'ß' behind; the remnant is kept with the token. |
| OZ 5 2  70 (long text) | Jeder Schraubenkopf (V2A) und jede Schraubenmutter (V4A) ist mit einer Beilagscheibe (V4A) zu versehen. | Every bolt head (V2A) and every bolt nut (V4A) is to be provided with a washer (V4A). | Contradicts s99aa46475b ('Schrauben aus V4A', 'Muttern und Beilagscheiben aus V2A'). Kept. |
| OZ 5 2  70 (long text) | wird gesondert vergütet | is paid separately | Unusual for preliminary remarks (one would expect 'nicht gesondert'); translated as written. |
| OZ 5 3 210 (long text) | WL- Höhe im vorläufigen System | WL level in the provisional system | 'im vorläufigen System' conflicts with s1b74edf753, which demands the official systems ETRS 89 / DHHN2016. 'WL' kept as an unexplained abbreviation. |
| OZ 5 3 210 (long text) | GGG DN 250 bis DN 300 ca. 2.380 m | GGG DN 250 to DN 300 approx. 2.380 m | Table rows are broken across lines in the source (value separated from 'DN', '70 m' and '400 m' on their own lines); line structure kept. |
| OZ 7 1  80 (long text) | Verrechnungssätze für Baugeräte und Lastkraftwagen bei Verrechnungssätze für Baugeräte und Lastkraftwagen bei Stundenlohnarbeiten | Billing rates for construction equipment and lorries for Billing rates for construction equipment and lorries for hourly-rate work | Heading line is duplicated in the source (also 'Material / Material' in sd26263e924); duplication kept. |
| OZ 7 1  80 (long text) | bzw. dem Lkw ein Ver- rechnungssatz | or the lorry a bil- ling rate | Leftover hyphenation inside a word ('Ver- rechnungssatz') and wrong case ('dem Lkw'); hyphenation leftover reproduced. |

## `Angebot AN24-0305.pdf`

German original: `dataset/04_pdf_tiefbau_sonstige/Angebot AN24-0305.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | ZV zur WV der Adelburggruppe | ZV zur WV der Adelburggruppe | Name of the client organisation / project (abbreviated association name) left verbatim as a proper name; also in sf306a1e3e5. 'AG Augsburg' (s04bba7bc08) is a court name in the letter footer, not the client code, left verbatim. |
| p. 2 | ngebot-Nr.: AN24-0305 | ffer No.: AN24-0305 | Label cut off at the start ('ngebot-Nr.' for 'Angebot-Nr.'), repeated in s48acc00337; cut kept ('ffer No.'). |
| p. 4 | wie vor, jedoch [PERSON_093] DK0 (einschließlich [KENNZEICHEN_004] | as before, but [PERSON_093] DK0 (including [KENNZEICHEN_004] | Short text breaks off: bracket opened and never closed; anonymisation tokens replaced the material name and what is included. Kept as is. |
| p. 5 | wie vor jedoch Zuschlag Kanalkreuzung | as before but surcharge sewer crossing | Comma missing in 'wie vor, jedoch' (also sefd265335f); in sc9e3089a2b, sea5a40b772, s964638d925 the comma is misplaced ('wie vor jedoch, GGG ...'). Punctuation reproduced. |
| p. 5 | Längeskreuzung | longitudinnal crossing | Misspelling of 'Längskreuzung' (neighbouring items spell it correctly); rendered with a comparable misspelling. |
| p. 5 | größer D = 70 cm - 100 cm | larger than D = 70 cm - 100 cm | Range written with '-' here, with 'bis' in the neighbouring items; wording not harmonised. |
| p. 5 | Längskreuzung Wasserleitung > DN 50 bis DN 300 | longitudinal crossing water pipe > DN 50 up to DN 300 | Range differs from the corresponding crossing item sfd38afc186 ('DN 100 bis DN 300'). Possibly intentional; both kept. |
| p. 11 | [ORT_030] für Archäologische | [ORT_030] for archaeological | Recurring pattern in this batch: anonymisation tokens replaced ordinary words / product terms and damage the text: [ORT_030] (s57d699ded4, sb6a06cf0b4, s04ff560cf1, sa37963f8d8), [PERSON_167] (s87b7aa4dba, s65bfd56cf6), [PERSON_017] apparently a valve type (s… |
| p. 11 | Stundenlohnarbeiten für Oberbodenabtrag bzw. | Hourly-rate work for topsoil stripping or | Heading breaks off after 'bzw.'; kept cut. |
| p. 12 | wie vor, jedoch Muffendruckrohre TYT DN 250 (C50) | as before, but socket pressure pipes TYT DN 250 (C50) | Short texts of the items following 'mit integrierter Zugsicherung' (s17a5c7e1ac, sbe3f868b5d) are identical to the earlier items without restraint (s08e84d2bd9, s2e8b2af671); the series also skips DN 200. Kept. |
| p. 13 | längkraftschlüssige Steckmuffenverbindung | longitudinaly force-locked push-in socket joint | Misspelling of 'längskraftschlüssige', repeated in s6291828a26 and sefd265335f; rendered with a comparable misspelling in all three. |
| p. 17 | Rohrleitungsmaterial PE HD sowie Steuerkabel liefern und verlegen (Kabellee | Supply and lay pipeline material PE HD and control cable (empty cable cond | Heading cut off in the middle of a word ('Kabellee'); in s0baf031c91 the same heading is cut earlier ('(Kabe' -> '(empty ca'). Cuts kept. |
| p. 17 | Steuerkabel A2Y-F (L) 20 x 2 x 0,8 | control cable A2Y-F (L) 20 x 2 x 0,8 | Unit 'mm' missing here and in sa31920c5bd, sd4a793e951, while s7ea4136e2a has '0,8 mm'. Not completed. |
| p. 20 | [PERSON_093] aufnehmen, transporieren, in Lagen einbauen | Pick up [PERSON_093], transprt, install in layers | Misspelling 'transporieren' (transportieren) rendered as 'transprt'. The token [PERSON_093] replaced the material name. |
| p. 20 | [PERSON_093] aufnehmen, transporieren, | [PERSON_093] pick up, transprt, | Misspelling 'transporieren' (transportieren), rendered with a comparable misspelling. |
| p. 21 | l = ca. 3.50 m | l = approx. 3.50 m | Decimal point instead of the decimal comma used elsewhere; kept. |
| p. 22 | wie vor, jedoch [PERSON_017] DN 250 (weichdichtend) und einbauen | as before, but [PERSON_017] DN 250 (resilient-seated) and install | Short text is incomplete ('liefern' missing before 'und einbauen'); same in s543a7ea1f0. The base item says 'Liefern und montieren'. |
| p. 23 | Umwickeln erdberührten | Wrapping of buried | Short text breaks off (noun missing); same in s25ebe81317, where only a stray '300' follows. |
| p. 25 | BG I, Werkpolier | BG I, works foreman | Inconsistent labels and spacing in the wage-group list: 'BG I', 'BGr. II', 'BGr.III', 'BGr.VI,Baufachwerker', 'BGr. VII,Bauwerker'. Reproduced as written. |
| p. 25 | Verrechnungssätze für Baugeräte und Lastkraftwagen bei | Charge-out rates for construction equipment and lorries for | Heading breaks off after 'bei'; kept cut. |
| p. 27 | Datum: 25.11.2024 | Date: 25.11.2024 | Date on the LV signature line (25.11.2024) lies after the dispatch date 28.02.2024 and bid deadline 27.03.2024 in the invitation form that follows (s8423af329c, sb75da0a4dd); the form also names a different project (HEM2301-2, waterworks conversion, Los 2 Ver… |

Text boxes where the English had to be shrunk below 72 % of the original size (26):

- p. 2, scale 0.65: Construction project:
- p. 3, scale 0.65: Construction project:
- p. 4, scale 0.65: Construction project:
- p. 5, scale 0.65: Construction project:
- p. 6, scale 0.65: Construction project:
- p. 7, scale 0.65: Construction project:
- p. 8, scale 0.65: Construction project:
- p. 9, scale 0.65: Construction project:
- p. 10, scale 0.65: Construction project:
- p. 11, scale 0.65: Construction project:
- p. 12, scale 0.65: Construction project:
- p. 13, scale 0.65: Construction project:
- p. 14, scale 0.65: Construction project:
- p. 15, scale 0.65: Construction project:
- p. 16, scale 0.65: Construction project:
- p. 17, scale 0.65: Construction project:
- p. 18, scale 0.65: Construction project:
- p. 19, scale 0.65: Construction project:
- p. 20, scale 0.65: Construction project:
- p. 21, scale 0.65: Construction project:
- p. 22, scale 0.65: Construction project:
- p. 23, scale 0.65: Construction project:
- p. 24, scale 0.65: Construction project:
- p. 25, scale 0.65: Construction project:
- p. 26, scale 0.65: Construction project:
- p. 27, scale 0.65: Construction project:

## `LV-Schachtbauwerk.pdf`

German original: `dataset/04_pdf_tiefbau_sonstige/LV-Schachtbauwerk.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | mindestens C20/ 25 einschließlich der | at least C20/ 25 including the | Segment stops mid-sentence at the page break (continues in s670d094bd2). Irregular spacing 'C20/ 25' kept; elsewhere 'C 20/25'. |
| p. 2 | mind 30 mm | min 30 mm | Missing full stop after 'mind'; kept. |
| p. 2 | AUSSTATTUNG (IN [PERSON_115] | FITTINGS-OUT (IN [PERSON_115] | Opening bracket is never closed (the token apparently swallowed the closing bracket); kept. |
| p. 3 | mit stabilen Scharnieren, verdeckt liegenden angeordnet zum Schutz vor Vandalismus | with sturdy hinges, concealed arranged for protection against vandalism | Garbled wording in the source ('verdeckt liegenden angeordnet'); rendered equally awkwardly. Also 'mit zwei [PERSON_115] (650 N)': a token stands where the gas springs are meant; and a full stop appears to be missing between 'Gasdruckfedern' and 'Schachtabdec… |
| p. 3 | OK des Entlüftungsrohres auf Höhe Entlüftungsrohr-OK des Schachtdeckels | OK of the vent pipe at the level of vent pipe OK of the shaft cover | Sentence is garbled / circular in the source (vent pipe OK at the level of vent pipe OK of the cover); kept. The pipe is also said to begin approx. 30 cm above the shaft floor while the cross-section 'in the first 30 cm' is to be kept clear for a fan; unclear… |
| p. 3 | SICHERHEITSEINSTIEGSLEITER ... Sicherheitssteigleiter ... Sprossen aus U-Profil mit gelochter Auftrittsfläche, 30 mm, (lt. | SAFETY ACCESS LADDER ... safety fixed ladder ... Rungs made of U-profile with perforated tread surface, 30 mm, (acc. to | Segment breaks off at the page end in the middle of a bracket ('(lt.'); it continues in sd3a7ae0d1e ('UVV).'). Heading and text use two different terms for the ladder. |
| p. 4 | erste Auftritt max. 28 cm über FFB ... Tritthöhe 280 mm ... bei - 10 cm von der Oberkante Schachtvierung | first step is max. 28 cm above FFL ... Rung spacing 280 mm ... at - 10 cm from the top edge of the shaft collar | 'FFB' (Fertigfußboden) rendered as 'FFL'. The sentence opens 'Inkl. Aufklappbare' with a wrong capital; not reproduced. |
| p. 4 | Leiter mit ausklappbarer Einhaltung für Schachtweite S = 100 cm bzw. 80 cm. | Ladder with fold-out holding aid for shaft width S = 100 cm or 80 cm. | 'Einhaltung' is an unusual word here (normally 'compliance'); apparently a holding / access aid is meant. Rendered 'holding aid' here and in s7bd936eadf ('Leiterlänge ohne Einhaltung'); the earlier text calls the part 'Einsteighilfe'. |
| p. 4 | Sämtliches Klein- und Befestigungsmaterial ... ist durch den AN zu liefern | All small parts and fixing material ... is to be supplied | The paragraph on fixing material repeats s6dda4fa12a almost word for word (copy-paste repetition in the source). |
| p. 4 | nach ges. Zeichnungen und vorstehenden Beschrieb | according to sep. drawings and the above description | Abbreviation 'ges.' is ambiguous (gesonderten / gesamten); rendered 'sep.' as the more likely reading. Grammar slip 'vorstehenden Beschrieb' in the source. |
| p. 5 | Rohrstützen aus V2A, höhenverstellbar ca. | Pipe supports made of V2A, height-adjustable approx. | Table labels without their values (the quantities are in separate cells); the line ends on a dangling 'ca.'. |
| p. 5 | Leiterlänge ohne Einhaltung | Ladder length without observance | Odd wording ('Einhaltung' makes no sense for a ladder; possibly a different word was meant). Translated literally. The list entries also carry no values, 'höhenverstellbar ca.' breaks off. |
| p. 6 | aus [PERSON_115] oder [PERSON_176] gefertigten Verschluß ... mit [PERSON_115] und selbsttätiger ... rostfreiem [PERSON_115] Umlaufende | made of [PERSON_115] or [PERSON_176] ... with [PERSON_115] and automatic ... stainless [PERSON_115] Circumferential | Recurring pattern in this batch: anonymisation tokens ([PERSON_115], [PERSON_176], [PERSON_017], [PERSON_076], [PERSON_093], [PERSON_069], [ORT_016], [FIRMA_101] ...) replaced material names and ordinary nouns (apparently 'Edelstahl', 'Schieber', 'Teil' etc.)… |
| p. 6 | Deckelgröe | Cover siz | Misspelling of 'Deckelgröße' (ß missing); rendered with a comparable misspelling. |
| p. 7 | l = ca. 3.50 m | l = approx. 3.50 m | Decimal point instead of the decimal comma used elsewhere; kept. |
| p. 8 | Jeder Schraubenkopf (V2A) und jede Schraubenmutter (V4A) ist mit einer Beilagscheibe (V4A) zu versehen. | Every bolt head (V2A) and every bolt nut (V4A) is to be provided with a washer (V4A). | Contradicts s99aa46475b ('Schrauben aus V4A', 'Muttern und Beilagscheiben aus V2A'). Kept. |
| p. 8 | Beschich-tung | coat-ing | Leftover hyphenation in the middle of a line; kept. 'Bei Verbindungen [PERSON_115]' is damaged by the token. |
| p. 9 | wie vor, jedoch FFR DN 300/250 [PERSON_115] V4A) | as before, but FFR DN 300/250 [PERSON_115] V4A) | Closing bracket without opening bracket (probably removed by the anonymisation token). |
| p. 10 | Storzübergangstück D 110 (A) / Baugröße DIN 110-A | Storz adapter D 110 (A) / size DIN 110-A | Short text says 'D 110 (A)', long text (s6ae019bb6c, s9a0639d681) says 'DIN 110-A'; 'DIN' looks like a slip for the Storz size designation. Kept as written. |
| p. 11 | Ausbaustücke DN 250 liefern und montieren Liefern und einbauen von Ausbaustücken | Dismantling joints DN 250 supply and assemble Supply and install dismantling joints | Short text 'montieren', long text 'einbauen'; kept as written. |
| p. 12 | Umwickeln erdberührten | Wrapping ground-contact | Short text breaks off and lacks the noun: 'Umwickeln erdberührten' (the long text s0655077a01 has the token [PERSON_076] in the place of the noun). Same in sb9f1ca4596. |
| p. 13 | aus [PERSON_115] h bis 60 cm, bis | of [PERSON_115] h up to 60 cm, up to | Short text is split over two segments (sc55c23f86b 'Profilstahlkonstruktionen / DN 250') and interleaved; 'für Nennweite bis' in s5895ce62be ends without a value. |
| p. 13 | eine [PERSON_069] gemäß Statik [PERSON_115] mit 4 Schraubenlöchern ... auf der Bauwerkssohle / [PERSON_074] / [FIRMA_101] das Bohren | a [PERSON_069] acc. to structural analysis [PERSON_115] with 4 bolt holes ... on the structure's base slab / [PERSON_074] / [FIRMA_101] the drilling | Sentence heavily damaged by anonymisation tokens; comma missing before 'das Bohren'. |

## `Leistungsverzeichnis.pdf`

German original: `dataset/04_pdf_tiefbau_sonstige/Leistungsverzeichnis.pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 1 | verusachten | casued | Misspelling of 'verursachten'. |
| p. 2 | verkehrsrechlicher Anordnung | traffic regulaton order | Misspelling of 'verkehrsrechtlicher'. Also 'StVo' instead of 'StVO' kept. |
| p. 3 | des umgebenden Baumbestande | the surrounding tree stnd | Misspelling ('Baumbestandes', letter missing). |
| p. 3 | Durchmesser 10 bis 20 cm / 21 - 30 cm / 20 - 50 cm | Diameter 10 to 20 cm / 21 - 30 cm / 20 - 50 cm | Diameter ranges of neighbouring items (se2d6333edf, sdf483d0dfe, sfaeea0b1e7 for rootstocks) overlap / do not line up; kept. |
| p. 4 | fahrlässig gefallene Grenzsteine | boundary stones negligently felled | Odd wording in the source; translated literally. |
| p. 5 | durch nachfolgen Positionen | by the followin items | Misspelling ('nachfolgende'). |
| p. 5 | des Oberbodens der lim Bereich archäologischer Grabungen | the topsoil the iin the area of archaeological excavations | Garbled words 'der lim Bereich' (probably 'im Bereich'); rendered with a comparable garble. The title of the Merkblatt is kept as a document name. |
| p. 5 | Baufeldbreite bis 14 m | working strip width up to 14 m | Short text says up to 14 m; the texts below (s95152d86f4, s60d37088e3) say 'max. 12,00 m bzw. 14 m', s3176444993 says 'max. 12,00 m' only, s51b9570d3a 'bis max. 12'. |
| p. 6 | Rohgrabens | pip trench | Misspelling of 'Rohrgrabens'. |
| p. 6 | max. mögliche Abrechnungsbreite ist max. 12,00 m | max. possible billing width is max. 12,00 m | Doubled 'max.' in the source; kept. |
| p. 6 | Abrechnungsbreite bis max. 12 | Billing width up to max. 12 | Line breaks off without decimals / unit. |
| p. 6 | Spül- und Entleerungsleitungen, Kanäle sowie Grund- | flushing and drain lines, sewers as well as bottom | Sentence runs over three segments (s329cfb3a21, s4a0abe3e64, s43e677b313); the word 'Grund-ablaßleitungen' is split between two segments. |
| p. 6 | Rasensonden | turf sonds | Misspelling of 'Rasensoden'. The segment ends mid-sentence ('Die Sicherung der'), continued after the page break in sd179fab777. |
| p. 7 | mitzuverlegenen Schutzrohre ... sowie des Steuerkabels | protective pipes to be laid alongsid ... as well as of the control cable | Misspelling ('mitzuverlegenden') and wrong case ('des Steuerkabels'); kept. |
| p. 7 | 5 %o | 5 %o | Per-mille sign written as '%o'; kept verbatim. |
| p. 7 | diesselbe | the saame | Misspelling of 'dieselbe'. |
| p. 8 | Der E zu betragen. | The E is to be. | Sentence torn apart by text extraction: 'Der E(V2) Wert an Unterkante Frostschutzschicht hat 45 MN/m² zu betragen' is split between saf04446439 and se37acfef1d. |
| p. 8 | (Sandbettung, Umhüllung etc. gelten im verdichteten Zustand) | (sand bedding, surround etc. apply in the compacted state) | Closing bracket misplaced in the source; kept. |
| p. 8 | Aushub in allen Bodenklassen gemäß DIN 18 300 ... für Homogenbereich 1 | Excavation in all soil classes acc. to DIN 18 300 ... for homogeneous zone 1 | Source mixes soil classes and homogeneous zones in one item; also 'DIN 18 300' here vs 'DIN 18300' in s6546457682. s2d79d3d7df refers to 'Bodenkl. 3, 4 u. 5'. |
| p. 8 | bestehden | existng | Misspelling of 'bestehenden'. Sentence also switches construction ('wieder verfüllen und ... zu verdichten'). |
| p. 8 | Maße der einzelnen Steine 1,50 x 0,60 x 0,60 m ... Höhe (3-reihig) = 1,80 m | Dimensions of the individual stones 1,50 x 0,60 x 0,60 m ... Height (3-row) = 1,80 m | No inconsistency in the figures (3 x 0,60 = 1,80); recorded only because '[ORT_030] / Rohrgrabenaushub' is damaged by a token and 'siehe Bild' refers to a picture not in the text. |
| p. 9 | weißt folgende Maße auf: | haz the following dimensions: | Misspelling ('weist'); the dimensions announced do not follow in the batch. |
| p. 10 | 4 Stück x ca. 3 m x 3 m x 2,5 m = 90 m³ | 4 pieces x approx. 3 m x 3 m x 2,5 m = 90 m³ | Arithmetic is consistent (4 x 3 x 3 x 2,5 = 90); 'Anfang, 2 x am Schacht und Ende' adds up to 4. |
| p. 11 | Abrechnungsbreite (DN 200 und DN 250) = 1,00 m | Billing width (DN 200 and DN 250) = 1,00 m | DN 200 appears here, while the pipeline lengths elsewhere list only DN 100, DN 250 and DN 300. |
| p. 11 | Gesamtstärke der Überdeckung = 10 cm Überdeckung Rohraußendurchmesser (Rohre > da 250 sind dabei abzuziehen!) | Total thickness of the cover = 10 cm cover pipe outside diameter (pipes > da 250 are to be deducted here!) | Operator missing between '10 cm Überdeckung' and 'Rohraußendurchmesser' (probably '+'); kept as written. |
| p. 11 | 3 % pro Tonne Aushub | 3 % per tonne of excavation | Unclear quantity basis in the source; kept. |
| p. 12 | (nach [PERSON_125] des AN) | (according to [PERSON_125] of the AN) | Ordinary word replaced by a token (probably 'Wahl'); not guessed in the translation. |
| p. 13 | wie vor, jedoch [PERSON_093] DK0 (einschließlich | as before, but [PERSON_093] DK0 (including | Short text breaks off after the opening bracket. |
| p. 13 | Auf- hängen; Bau- gruben; Baustellenein- richtung; Wieder- verfüllung; Absperr- vorrichtung; Auftrag- nehmer; je- weiligen | sus- pending; excava- tion pits; site set- up; back- filling; shut-off de- vice; con- tractor; re- spective | Recurring pattern in this batch: leftover hyphenation with a space inside a word (also s81b866c5aa, s8f42533903, s84018b4d60, sb76621e863, sd39e245e43). Kept as broken words in English. |
| p. 13 | mit einem [PERSON_089] oder [PERSON_089] bzw. mittels Eichenbohlen | with a [PERSON_089] or [PERSON_089] or by means of oak planks | Recurring pattern in this batch: anonymisation tokens replaced ordinary nouns and damage the sentence (e.g. [PERSON_167] for the item's subject in s1ef822b8f0, [PERSON_017] for the valve in s3bada10c5c / sadc304ece3, [PERSON_115] for a material, [PERSON_029],… |
| p. 15 | Längeskreuzung | longitudinall crossing | Misspelling of 'Längskreuzung' (neighbouring items spell it correctly); rendered with a comparable misspelling. |
| p. 15 | die W396, das Merkblatt Nr. 1.8/7 sowie die TRGS51 | the W396, the leaflet No. 1.8/7 as well as the TRGS51 | 'TRGS51' here, but 'TRGS 519' in the following segments (s937ff30d87, sed715387fd); the reference looks truncated. Kept as written. 'W396' also written without a space. |
| p. 15 | Arbeitsbereiches,Tragen der persönliche Schutzausrüstung ... etc.und die ... sind einzuhalten | work area,wearing the personal protective equipment ... etc.and the ... are to be complied with | Missing spaces after comma and full stop, double space, and wrong case ending ('der persönliche') in the source; spacing kept. The same text is repeated in s2f84b01529 / sed715387fd (split over a page break). |
| p. 16 | 2 Be- und Entlüfterventil á 1 m³ | 2 air inlet and release valve at 1 m³ each | Singular noun after the number 2 and 'á' instead of 'à' in the source; singular kept. |
| p. 17 | Notrstromversorgung | emergrency power supply | Misspelling of 'Notstromversorgung'; rendered with a comparable misspelling. |
| p. 17 | Die ggf. erforderlich werdende Reinigung ... sind vom AN auf dessen Kosten auszuführen. | The cleaning ... that may become necessary ... are to be carried out by the AN at his expense. | Singular subject with plural verb in the source; kept. |
| p. 18 | nach [ORT_016] D der "ZTV-Wa [ORT_030] durch Einsatz einer Pumpe | according to [ORT_016] D of the "ZTV-Wa [ORT_030] by use of a pump | Opening quotation mark is never closed (the closing part was swallowed by the token); 'etc..' with double full stop. Kept. |
| p. 19 | erfolgt die Vergütung pro weitere Schnitttiefe mit 1/20 des Einheitspreises | payment is made per further cutting depth at 1/20 of the unit price | The unit of the increment is missing (presumably per further cm); ambiguous, kept as written. |
| p. 19 | Verformungsmodul E Abgerechnet wird nach Auftragsprofilen. | deformation modulus E Billing is by fill profiles. | The sentence is torn apart by text extraction: 'E' stands alone and its continuation 'V2 auf der Oberfläche mindestens 120 MN/m².' is the separate segment s3c154a4299. Order kept as in the source. |
| p. 20 | In Verkehrsflächen für ländliche Wege.. | In traffic areas for rural roads.. | Double full stop in the source; kept. |
| p. 20 | Polymermodifiiertes Bitumen | polymer-modifed bitumen | Misspelling of 'polymermodifiziertes'; rendered with a comparable misspelling. |
| p. 21 | In den EHP einzurechen ist ... gemä den Vorbemerkungen | To be includd in the EHP is ... accordin to the preliminary remarks | Two misspellings ('einzurechen' for 'einzurechnen', 'gemä' for 'gemäß'); rendered with comparable misspellings. 'EHP' (unusual abbreviation for unit price, elsewhere EP) kept as written. |
| p. 25 | seitlich lagen | stor at the side | Misspelling of 'lagern' (correct in the preceding item sc8c5f633c6); rendered with a comparable misspelling. |
| p. 27 | [ORT_030] für Archäologische | [ORT_030] for archaeological | Recurring pattern in this batch: anonymisation tokens replaced ordinary words / product terms and damage the text: [ORT_030] (s57d699ded4, sb6a06cf0b4, s04ff560cf1, sa37963f8d8), [PERSON_167] (s87b7aa4dba, s65bfd56cf6), [PERSON_017] apparently a valve type (s… |
| p. 27 | [ORT_030] für Archäologisc… | [ORT_030] for archaeologic… | Heading cut off in the source; cut kept. Same for s50d1c8a5a3 'Rohrleitungsmaterial GGG lie…' → 'Pipeline material GGG sup…'. |
| p. 28 | mit ingetrierter Zugsicherung | with intergated tensile restraint | Misspelling of 'integrierter'; rendered with a comparable misspelling. Also 'Erkennungs-ring' (stray hyphen) rendered 'identification-ring', and 'Dichthaltering' (unusual compound) rendered 'sealing retaining ring'. |
| p. 29 | Baufortschriftt | construction progresss | Misspelling of 'Baufortschritt'; rendered with a comparable misspelling. |
| p. 30 | Rohre GGG DN 125 bis DN 500 | pipes GGG DN 125 to DN 500 | The pipes specified in this batch are DN 250 and DN 300; the range DN 125 to DN 500 looks like a copy-paste leftover. Likewise s80b90f7277 'Muffenschutz aus Gummi DN 500' is followed by 'wie vor' items for DN 250, DN 200, DN 100. Kept. |
| p. 31 | längkraftschlüssige Steckmuffenverbindung | longitudnally force-locked push-in socket joint | Misspelling of 'längskraftschlüssige' (spelled correctly in s7625010d42); also in s47865b2d9a and s474e307103. Rendered with a comparable misspelling. |
| p. 31 | innen und außen emailiert | enamelld inside and outside | Misspelling of 'emailliert'; rendered with a comparable misspelling. The segment also starts as a surcharge for pipelines GGG DN 300 and continues as supply and laying of fittings. |
| p. 33 | Schrauben aus V2A und Muttern / Beilagscheiben aus V4A | bolts of V2A and nuts / washers of V4A | Contradicts the general requirement in sc9659e0ea5 ('Schrauben aus V4A', 'Muttern und Beilagscheiben aus V2A'): the steel grades are swapped. Same in sd979c01779. Both kept. |
| p. 36 | Außendurchmesser: 450 mm Getriebeuntersetzte Absperrarmatur mit vollem Durchgang DN 80, komplett aus [PERSON_115] Monolithischer PE-Schacht mit Auftriebssicher… | Outside diameter: 450 mm Gear-reduced shut-off valve with full bore DN 80, completely of [PERSON_115] Monolithic PE shaft with anti-flotation ribs, sturdy PE c… | Stray comma in 'Lose beigelegtes, Drainagerohr'; kept as 'Loosely enclosed, drainage pipe'. Material of the valve replaced by a token ('komplett aus [PERSON_115]'). |
| p. 36 | hochwertiger (EKB) Schwimmerwerkstoff: | high-quality (EKB) Float material: | Fragments of a sentence scattered by text extraction: 'Gehäusewerkstoff: Duktilguss (GGG) mit' (se21991fc1d), 'hochwertiger', '(EKB)', 'Epoxid-Beschichtung' (s1911101a69). Order kept as in the source. |
| p. 37 | sowie Entnehmen/Einsetzen Ventils | as well as removing/inserting valve | Article missing in the source ('des Ventils'); kept terse. |
| p. 37 | gemä ATV-DVWK-A 142 | accordin to ATV-DVWK-A 142 | Misspelling of 'gemäß'; rendered with a comparable misspelling. |
| p. 38 | 1.8-3 vom (Stand 12.2000) | 1.8-3 of (as of 12.2000) | The date after 'vom' is missing. The leaflet number 1.8-3 here differs in notation from 'Merkblatt Nr. 1.8/7' in sf571a2977d. Kept. |
| p. 39 | Um das vorhande F-Stück | To connect the existng F-piece | Misspelling 'vorhande' (vorhandene), rendered with a comparable misspelling. |
| p. 39 | [ORT_030] Wasserhaltung, erforderliche Einbauteile werden gesondert vergütet. | [ORT_030] dewatering, required built-in parts are paid separately. | Anonymisation token [ORT_030] replaced an ordinary word and damages the sentence. Recurring pattern in this batch: [ORT_030] (also s1123ed174d, seae9634ed8, s8df28951a5, s67f3d4b3a0, sc68c0ca1fe, s07f0d9658d), [PERSON_115] where a material is meant (s2750c079… |
| p. 40 | an die entgültige Oberflächenwiederherstellung | to the fianl surface reinstatement | Misspelling 'entgültige' (endgültige), rendered with a comparable misspelling. |
| p. 40 | Rohrleitungsmaterial GGG ve… | Pipeline material GGG la… | Heading cut off in the source in the middle of a word; cut kept. Same for sd990a84e31, s61ae32a0e5, se32a291a46, sfc886564a7, sbac750de7d. |
| p. 41 | bestehend aus 3 Innenrohren | consisting of 3 inner pipes | Contradiction with neighbouring segment s1f45d32238 ('2 x Rohre 50 x 4,6 mm') and s4a6069bd88 / s7c4684b8ed ('2 x da 50'): 3 inner pipes vs 2 pipes. Both kept. |
| p. 41 | Lieferlänge: | Delivery length: | Label without value in this segment; the value follows as separate segment seb12fd51a3 ('mind. 1500 m auf Trommel'). |
| p. 43 | Längskreuzung wird vergütet ab einer Kreuzung von mindestens 45° | Longitudinal crossing is paid from a crossing of at least 45° | Odd wording: a 'longitudinal' crossing defined by a crossing angle of at least 45°; 'sonst wie Pos. Kreuzungen' refers to an item without number. Kept as is. Sentence continues across the page break in s643f39d14a. |
| p. 44 | wie vor, jedoch Längeskreuzung Kanalleitung größer D = 40 cm bis 70 cm (context) | (context only, not translated) | Neighbouring item (context) has misspelling 'Längeskreuzung' while this segment has 'Längskreuzung'. |
| p. 44 | Im dem angebotenen EP ist enthalten: | In the the EP offered is included: | Grammar slip 'Im dem' (doubled article), rendered with a doubled 'the'. |
| p. 44 | nur auf ausdruckliche Anordnung des Auftraggebers bzw. dessen Vertretes | only on expres instruction of the client or his representatve | Two misspellings: 'ausdruckliche' (ausdrückliche) and 'Vertretes' (Vertreters), rendered with comparable misspellings. |
| p. 45 | inkl schriftlicher Nachweis | incl written proof | Abbreviation 'inkl' without full stop (the parallel segment s407c837988 has 'inkl.'); kept without full stop. |
| p. 45 | mittels Korrossionsschutzmittel / -anstrich | with corrossion protection agent / coating | Misspelling 'Korrossionsschutzmittel', rendered with a comparable misspelling. |
| p. 46 | Einschließlich ab Werk vorgefertigter und verschlosse- | Incl. factory-prefabricated and seal- | Sentence broken in the middle of a word at the page break; continues in s8df28951a5 ('ner Einführungen …' → 'ed entries …'). Cut kept in both segments. |
| p. 48 | als Pauschalen ausnahmlich der [ORT_030] und Sonderleistungen | as lump sums with the excepton of the [ORT_030] and special services | Non-standard word 'ausnahmlich' (probably 'ausschließlich' / 'mit Ausnahme'), rendered with a misspelling; meaning 'excluding' assumed from context. |
| p. 48 | Güte- schutzgemeinschaft | quality- protection association | Stray hyphen plus space inside a word (leftover of an old line break); also 'Güte- überwachung' in saebce7fb53 and 'Abbinde- verzögerer' in sdbb4c03879. Kept. |
| p. 48 | nicht gröer als 15 km | not be greatr than 15 km | Misspelling 'gröer' (größer), rendered with a comparable misspelling. The segment ends with 'aus dem Lieferwerk:' with no plant named. |
| p. 50 | [PERSON_093] aufnehmen, transporieren, | [PERSON_093] pick up, transpot, | Misspelling 'transporieren' (for transportieren), rendered with a comparable misspelling 'transpot'. The same short text in s38e6245d83 is spelled correctly. |
| p. 50 | der vor genannten Positionen | of the afore mentioned items | 'vorgenannten' written as two words; rendered as 'afore mentioned'. |
| p. 50 | das Vor-haltens und Betreiben … Bei gröeren Fördermengen | the keeping available on site's and operating … For largr delivery rates | Grammar slip 'das Vorhaltens' and misspelling 'gröeren' (größeren), rendered with comparable slips. The sentence 'Für den An- und Abtransport …' has no main verb. |
| p. 52 | mindestens C20/ 25 einschließlich der | at least C20/ 25 incl. the | Sentence breaks off after 'einschließlich der'; the next segment is the heading FUGENBAND. Cut kept. Spacing 'C20/ 25' differs from 'C 20/25' in neighbouring segments. |
| p. 53 | mind 30 mm | min 30 mm | Missing full stop after 'mind'; kept. |
| p. 53 | Körnung bis höchstens 8 mm … die Sichtflächen sind zu glätten | grain size up to at most 8 mm … the exposed surfaces are to be smoothed | Differs from the item text s9809af6a26 for the same square shaft frame: grain size up to 15 mm, surfaces to be bush-hammered, cross-section b/h = 25/30 cm vs '25 x d + 5 cm'. Both kept. |
| p. 53 | AUSSTATTUNG (IN [PERSON_115] | FITTINGS-OUT (IN [PERSON_115] | Opening bracket is never closed (the token apparently swallowed the closing bracket); kept. |
| p. 54 | mit stabilen Scharnieren, verdeckt liegenden angeordnet zum Schutz vor Vandalismus | with sturdy hinges, concealed arranged for protection against vandalism | Garbled wording in the source ('verdeckt liegenden angeordnet'); rendered equally awkwardly. Also 'mit zwei [PERSON_115] (650 N)': a token stands where the gas springs are meant; and a full stop appears to be missing between 'Gasdruckfedern' and 'Schachtabdec… |
| p. 54 | OK des Entlüftungsrohres auf Höhe Entlüftungsrohr-OK des Schachtdeckels | OK of the vent pipe at the level of vent pipe OK of the shaft cover | Sentence is garbled / circular in the source (vent pipe OK at the level of vent pipe OK of the cover); kept. The pipe is also said to begin approx. 30 cm above the shaft floor while the cross-section 'in the first 30 cm' is to be kept clear for a fan; unclear… |
| p. 54 | SICHERHEITSEINSTIEGSLEITER ... Sicherheitssteigleiter ... Sprossen aus U-Profil mit gelochter Auftrittsfläche, 30 mm, (lt. | SAFETY ACCESS LADDER ... safety fixed ladder ... Rungs made of U-profile with perforated tread surface, 30 mm, (acc. to | Segment breaks off at the page end in the middle of a bracket ('(lt.'); it continues in sd3a7ae0d1e ('UVV).'). Heading and text use two different terms for the ladder. |
| p. 55 | erste Auftritt max. 28 cm über FFB ... Tritthöhe 280 mm ... bei - 10 cm von der Oberkante Schachtvierung | first step is max. 28 cm above FFL ... Rung spacing 280 mm ... at - 10 cm from the top edge of the shaft collar | 'FFB' (Fertigfußboden) rendered as 'FFL'. The sentence opens 'Inkl. Aufklappbare' with a wrong capital; not reproduced. |
| p. 55 | Leiter mit ausklappbarer Einhaltung für Schachtweite S = 100 cm bzw. 80 cm. | Ladder with fold-out holding aid for shaft width S = 100 cm or 80 cm. | 'Einhaltung' is an unusual word here (normally 'compliance'); apparently a holding / access aid is meant. Rendered 'holding aid' here and in s7bd936eadf ('Leiterlänge ohne Einhaltung'); the earlier text calls the part 'Einsteighilfe'. |
| p. 55 | nach ges. Zeichnungen und vorstehenden Beschrieb | according to separate drawings and above description | 'ges.' is ambiguous (gesonderten / gesamten); rendered as 'separate'. Grammar slip 'vorstehenden Beschrieb'. |
| p. 56 | Rohrstützen aus V2A, höhenverstellbar ca. | Pipe supports made of V2A, height-adjustable approx. | Table labels without their values (the quantities are in separate cells); the line ends on a dangling 'ca.'. |
| p. 56 | Leiterlänge ohne Einhaltung | Ladder length without observance | Odd wording ('Einhaltung' makes no sense for a ladder; possibly a different word was meant). Translated literally. The list entries also carry no values, 'höhenverstellbar ca.' breaks off. |
| p. 57 | aus [PERSON_115] oder [PERSON_176] gefertigten Verschluß ... mit [PERSON_115] und selbsttätiger ... rostfreiem [PERSON_115] Umlaufende | made of [PERSON_115] or [PERSON_176] ... with [PERSON_115] and automatic ... stainless [PERSON_115] Circumferential | Recurring pattern in this batch: anonymisation tokens ([PERSON_115], [PERSON_176], [PERSON_017], [PERSON_076], [PERSON_093], [PERSON_069], [ORT_016], [FIRMA_101] ...) replaced material names and ordinary nouns (apparently 'Edelstahl', 'Schieber', 'Teil' etc.)… |
| p. 57 | Deckelgröe | Cover siz | Misspelling of 'Deckelgröße' (ß missing); rendered with a comparable misspelling. |
| p. 58 | l = ca. 3.50 m | l = approx. 3.50 m | Decimal point instead of the decimal comma used elsewhere; kept. |
| p. 59 | Jeder Schraubenkopf (V2A) und jede Schraubenmutter (V4A) ist mit einer Beilagscheibe (V4A) zu versehen. | Every bolt head (V2A) and every bolt nut (V4A) is to be provided with a washer (V4A). | Contradicts s99aa46475b ('Schrauben aus V4A', 'Muttern und Beilagscheiben aus V2A'). Kept. |
| p. 59 | Beschich-tung | coat-ing | Leftover hyphenation in the middle of a line; kept. 'Bei Verbindungen [PERSON_115]' is damaged by the token. |
| p. 60 | wie vor, jedoch FFR DN 300/250 [PERSON_115] V4A) | as before, but FFR DN 300/250 [PERSON_115] V4A) | Closing bracket without opening bracket (probably removed by the anonymisation token). |
| p. 61 | Storzübergangstück D 110 (A) / Baugröße DIN 110-A | Storz adapter D 110 (A) / size DIN 110-A | Short text says 'D 110 (A)', long text (s6ae019bb6c, s9a0639d681) says 'DIN 110-A'; 'DIN' looks like a slip for the Storz size designation. Kept as written. |
| p. 64 | aus [PERSON_115] h bis 60 cm, bis | of [PERSON_115] h up to 60 cm, up to | Short text is split over two segments (sc55c23f86b 'Profilstahlkonstruktionen / DN 250') and interleaved; 'für Nennweite bis' in s5895ce62be ends without a value. |
| p. 64 | eine [PERSON_069] gemäß Statik [PERSON_115] mit 4 Schraubenlöchern ... auf der Bauwerkssohle / [PERSON_074] / [FIRMA_101] das Bohren | a [PERSON_069] acc. to structural analysis [PERSON_115] with 4 bolt holes ... on the structure's base slab / [PERSON_074] / [FIRMA_101] the drilling | Sentence heavily damaged by anonymisation tokens; comma missing before 'das Bohren'. |
| p. 66 | Bestandvermessung und -pläne (context) | (context only) | Context spells 'Bestandvermessung' while s534f695eda has 'Bestandsvermessung'. |
| p. 67 | BG I, Werkpolier | BG I, works foreman | Inconsistent labels and spacing in the wage-group list: 'BG I', 'BGr. II', 'BGr.III', 'BGr.VI,Baufachwerker', 'BGr. VII,Bauwerker'. Reproduced as written. |
| p. 67 | bzw. dem Lkw ein Ver- rechnungssatz | or the lorry a bil- ling rate | Leftover hyphenation inside a word ('Ver- rechnungssatz') and wrong case ('dem Lkw'); hyphenation leftover reproduced. |

Text boxes where the English had to be shrunk below 72 % of the original size (1):

- p. 19, scale 0.64: Construction material mixture:
