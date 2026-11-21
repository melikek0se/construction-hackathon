# Translation notes — project D

Source defects noticed in the files of this project and how they were carried over. What applies to all files is in `../TRANSLATION_NOTES.md`.

## `GAEB-[PROJEKT_004].X83`

German original: `dataset/01_gaeb_xml/GAEB-[PROJEKT_004].X83`

| Where | German original | English rendering | Note |
|---|---|---|---|
| DetailAddText | nicht seperat vergütet | not paid seperately | Misspelling 'seperat' (separat); rendered with a comparable misspelling. Occurs again in s909e23b7bd. |
| DetailAddText | Die derzeitige Verrohrung hat einen Durchmesser von 600 mm / Übergang von 800er-Betonrohre auf neue 800er-Stahlbetonrohre | The current piping has a diameter of 600 mm / Transition from 800 concrete pipes to new 800 reinforced concrete pipes | Existing piping is stated as 600 mm (also s89fa28e43a / s3e5f2a8dc7: DN 600), but the sequence and item s32b4a227cf / s4dc81590c1 speak of existing 800 concrete pipes. Left as is. The sentence '... 600 mm' also has no full stop. |
| DetailAddText | Der Baubeginn ist variabel (nach [PERSON_125] AN). / Wasserhaltung, [PERSON_139] Bach. / Im Zuge [ORT_030] | The start of construction is variable (at [PERSON_125] AN). / Dewatering, [PERSON_139] stream. / In the course of [ORT_030] | Recurring pattern in this LV: anonymisation tokens replaced ordinary words ([PERSON_125] apparently for 'Wahl', also [PERSON_139], [ORT_030], [PERSON_121], [PERSON_093], [PERSON_047], [PERSON_072], [PERSON_173], [PERSON_163], [PERSON_129], [PERSON_097], [PERS… |
| OZ 01 (Text) | Die Kosten hierfür werden nicht seperat vergütet | The costs for this are not paid seperately | Misspelling 'seperat' again; kept as misspelling. |
| OZ 02.0003 (TextOutlTxt) | Oberbodenabtrag- und auftrag | Topsoil stripping- and re-spreading | Misplaced hyphen in the source; kept. |
| OZ 02.0019 (TextOutlTxt) | [PERSON_047] aufnehmen und entsorgen - Einstufung : RW 1 | Pick up and dispose of [PERSON_047] - classification : RW 1 | Short text gives classification RW 1; the long text (s128f142a8e) only says 'Material unbelastet, gemäß RC-Leitfaden' and does not mention RW 1. |
| OZ 02.0021 (Text) | Nachweis des geforderten Verformungs- / module mittels | proof of the required deformation / moduli by means of | Hyphenated word 'Verformungs-module' split over two text nodes, with an odd word form ('module'); translated by meaning. |
| OZ 02.0022 (Text) | maschinell (Fertiger) und von Hand,einbauen, | by machine (paver) and by hand,install, | Missing space after the comma in the source; kept. |
| OZ 02.0023 (TextOutlTxt) | Asphalt fräsen, 4 cm - Fräsgut auf AG-Lagerplatz | Mill asphalt, 4 cm - milled material to AG storage area | Short text: 'AG-Lagerplatz' and '4 cm'; long text (s234536e3b1): 'auf AG-Kippe abfahren' and 'Frässtärke mind. 4 cm'; billing 'nach m3' is stated only in the long text. |
| OZ 02.0024 (TextOutlTxt) | Asphaltbeton 0/11 mm, Stärke 4 cm | Asphalt concrete 0/11 mm, thickness 4 cm | Short text uses the old designation 'Asphaltbeton 0/11', long text (s4dc8176bcd) 'AC 11 DN'; likewise sa4f22be75b 'Bitukies AC 32 TN' against 'Asphalttragschicht' in s38e0300fa6. In s4dc8176bcd the word 'Asphaltdeckschicht' is split over three text nodes. |
| OZ 03.0001 (Text) | Betonfestigkeit bsi 120 N/mm2 | Concrete strength up ot 120 N/mm2 | Typo 'bsi' (bis); rendered with a comparable typo. |
| OZ 03.0004 (TextOutlTxt) | FBS - Pass- und Gelenkstück DN 900 mm | FBS - adjusting and articulated piece DN 900 mm | No own long text for the DN 900 item appears in the batch next to this short text (the long text s236337cb34 says '01) DN 800 mm'); possibly the item reuses the DN 800 long text. |
| OZ 03.0010 (Text) | und vermörtel, Mörtel liefern. | and morta in, supply mortar. | Truncated / misspelled word 'vermörtel' (vermörteln); rendered with a comparable misspelling. |

## `LV-Ausdruck-[PROJEKT_004].pdf`

German original: `dataset/04_pdf_tiefbau_sonstige/LV-Ausdruck-[PROJEKT_004].pdf`

| Where | German original | English rendering | Note |
|---|---|---|---|
| p. 3 | werden nicht seperat vergütet | are not paid seperately | Misspelling 'seperat' (separat) rendered as 'seperately'. Same in s699f102f07. |
| p. 4 | Die Beauftragung eines, dann erforderlichen, SiGe-Koordinator erfolgt durch den AN. | The commissioning of a, then required, health and safety coordinator is done by the AN. | Grammar slip in the source (missing genitive ending 'Koordinators') and odd comma placement; commas kept. |
| p. 4 | Die Kosten hierfür werden nicht seperat vergütet | The costs for this are not paid seperately | Misspelling 'seperat' (separat) rendered as 'seperately'. |
| p. 8 | Verdrängung durch Schächte und Rohre werden abgezogen. | displacement by shafts and pipes are deducted. | Subject-verb disagreement in the source (singular 'Verdrängung', plural 'werden'); kept. |
| p. 12 | Nachweis des geforderten Verformungs- module | proof of the required deformation moduli | Grammatically inconsistent in the source (singular article 'des geforderten' with 'Verformungs-module'); unclear whether one modulus or several is meant. |
| p. 12 | maschinell (Fertiger) und von Hand,einbauen, | by machine (paver) and by hand,install, | Missing space after the comma and a misplaced comma in the source; kept. |
| p. 15 | Betonfestigkeit bsi 120 N/mm2 | Concrete strength up ot 120 N/mm2 | Misspelling 'bsi' (bis) rendered as 'up ot'. |
| p. 18 | liefern und fachgerecht versetzen und vermörtel, Mörtel liefern. | supply and set properly and bed in mortr, supply mortar. | Misspelling / truncated word 'vermörtel' (vermörteln) rendered as 'bed in mortr'. |

Text boxes where the English had to be shrunk below 72 % of the original size (19):

- p. 4, scale 0.7: Data processing no. AG:
- p. 5, scale 0.7: Data processing no. AG:
- p. 6, scale 0.7: Data processing no. AG:
- p. 7, scale 0.7: Data processing no. AG:
- p. 8, scale 0.7: Data processing no. AG:
- p. 9, scale 0.7: Data processing no. AG:
- p. 10, scale 0.7: Data processing no. AG:
- p. 11, scale 0.7: Data processing no. AG:
- p. 12, scale 0.7: Data processing no. AG:
- p. 13, scale 0.7: Data processing no. AG:
- p. 14, scale 0.7: Data processing no. AG:
- p. 15, scale 0.7: Data processing no. AG:
- p. 16, scale 0.7: Data processing no. AG:
- p. 17, scale 0.7: Data processing no. AG:
- p. 18, scale 0.7: Data processing no. AG:
- p. 19, scale 0.7: Data processing no. AG:
- p. 20, scale 0.7: Data processing no. AG:
- p. 21, scale 0.7: Data processing no. AG:
- p. 22, scale 0.7: Data processing no. AG:
