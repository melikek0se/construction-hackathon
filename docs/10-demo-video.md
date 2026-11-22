# Demo video: "Jürgen gets a tender"

Two minutes, and nearly all of it is the app. One tender is followed from the moment it drops into the
estimator's mailbox to the moment the contract is won; the point of every scene is that Polier works from
the mail by itself and the estimator only decides. The humour is Jürgen, who says what estimators think.

Second version (Atahan, 2026-11-22). The first, a film-trailer parody ("The Estimator"), spent a quarter of
its time on staged scenes and title cards; he asked for the app instead, and for this order of scenes.
The first cut of the old version is `scripts/demo_video/demo.mp4` until the new one replaces it.

## The picture

- **Split screen where mail matters**: on the left the estimator's mailbox (the webmail of the demo mail
  server, `kalkulation@polier.test`), on the right Polier. Otherwise Polier alone, with close-ups.
- **The document fills up** (Atahan, 2026-11-22): the tender's document in the middle of the page is the
  spine of the film. After every step the camera comes back to the same items in the same framing, and
  there is more on them each time: the bare LV, then the findings beside it, then the questions, then the
  first prices from the price book, then the client's answers and corrected quantities, then the quotes,
  until every item carries a price and the bid total stands. The map at the left fills in the same way.
- A small clock in the corner says when we are ("Mon 08:12", "an hour later", "three weeks later"): the
  waits are cut, and the film says so.
- Jürgen is heard, not seen (German, subtitled in English). A narrator says one short line per scene.

## Story

| # | Time | Left: the mailbox | Right: Polier | Said |
|---|------|-------------------|---------------|------|
| 1 | 0:00–0:10 | An invitation to bid arrives from the Stadt Norderbek, an LV attached. | The board. A card appears in the Intake by itself; the six stations run: read, rules, AI review, compare. | Narrator: "Monday, 8:12. A tender lands in Jürgen's inbox. Jürgen is getting coffee." |
| 2 | 0:10–0:18 | | Polier calls: "A tender was found in the mail." A click on it: the tender, checked already. | Narrator: "By the time he is back, it has been read. All of it." |
| 3 | 0:18–0:32 | | The document with the findings beside it; close-up of the worst item with its quoted passage and the money at stake. | Jürgen: "Was ist das denn für eine Position? Wollen die uns verarschen?" Narrator: "Polier put it more politely." |
| 4 | 0:32–0:42 | | "Take it on". Polier writes the questions for the client, sorts the items into packages for suppliers and subcontractors, and fills in what the price book knows. The document: question marks and first prices appear. | Narrator: "One click: take it on. The questions are drafted, the inquiries sorted, the known prices filled in." |
| 5 | 0:42–0:54 | The message to the client leaves. | Jürgen ticks the questions he wants asked; the message is written beside them; sent. | Narrator: "Jürgen decides what is asked. Polier writes it. In German." |
| 6 | 0:54–1:04 | The inquiries leave. | The packages: who is asked for what; sent. | Narrator: "Then the suppliers." |
| 7 | 1:04–1:16 | | One package has nobody to ask. "Find firms": Polier looks on the web, proposes firms, one is added. | Jürgen: "Dafür haben wir keinen." Narrator: "Nobody for this one. So Polier goes and finds somebody." |
| 8 | 1:16–1:32 | Replies come in: the client's answers, two quotes, a supplier who asks back. | Polier calls each one out; in the document the answers stand at their questions and the quotes at their items; a reply to the supplier is drafted. | Narrator: "Jürgen does nothing. The answers are read, the quotes compared, the next reply drafted." |
| 9 | 1:32–1:44 | | Jürgen confirms what the answers change (a quantity, an allowance) and takes the prices; the document is nearly full. The partner's page: its prices and products are up to date. | Narrator: "He confirms what changes. Every price keeps its source, and every partner its record." |
| 10 | 1:44–1:52 | The bid leaves. | "Finish the bid": what is left for him, filled, the document complete, submitted. | Narrator: "What is left is his. Then it goes out." |
| 11 | 1:52–2:00 | "Three weeks later": the award arrives. | Polier: "You won it!", confetti, the card moves to Award. | Jürgen: "Na also." Narrator: "Polier. It reads the mail, so you can build." |

## What is real, and what is helped along

- Everything on the right is the app doing what it does: finding the tender in the mail, the checks, the
  questions and packages, reading the replies and quotes, the search for firms, the award.
- The other side of the mail is played: the client and the firms are `scripts/demo_counterpart.py` (Claude
  writes their replies), the award is a mail sent by the recording script. The film's tender is a made-up
  one of its own, so no tender of the demo world is used up.
- Waits are cut (the checks take minutes, a supplier takes days). The mailbox is looked into when the scene
  needs it instead of on the server's three-minute clock.
- Not in the app: Polier does not answer a supplier by itself. It drafts the answer; the estimator sends it.
  Scene 8 shows it that way.

## How it is made

`scripts/demo_video/`: `story.mjs` (lines and shots), `make.mjs` (voice and music from ElevenLabs, shots
recorded from the running app with Playwright, cut with ffmpeg). `node make.mjs all` → `out/demo.mp4`.
Unlike the first version, recording this one acts in the app: it takes a tender on, sends mail on the demo
mail server and submits a bid, all on the film's own tender.

## Open

- Not shot yet. Scenes 4 to 11 are written from the code and the pages, not from a run-through.
- Jürgen's voice: no German voice on the account; a library voice speaks German with an accent.
