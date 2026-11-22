# Demo video: "Jürgen gets a tender"

Two minutes, and nearly all of it is the app. One tender is followed from the moment it drops into the
estimator's mailbox to the moment the contract is won; the point of every scene is that Polier works from
the mail by itself and the estimator only decides. The humour is Jürgen, who says what estimators think.

Second version (Atahan, 2026-11-22). The first, a film-trailer parody ("The Estimator"), spent a quarter of
its time on staged scenes and title cards; he asked for the app instead, and for this order of scenes.
The first cut of this version is `scripts/demo_video/demo.mp4`.

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

## Story (as cut, 2026-11-22)

The lines are in `scripts/demo_video/story.mjs` (`LINES`); the shots there are in the order of the film.

| # | Time | Left: the mailbox | Right: Polier | Said |
|---|------|-------------------|---------------|------|
| 1 | 0:00 | The invitation to bid arrives (Stadt Norderbek, X83 and PDF). | The board: a card appears in the Intake, the checks run. | "Monday, eight twelve. A tender lands in Jürgen's inbox. Jürgen is getting coffee." |
| 2 | 0:09 | | He opens it: fits your work, 5 stops, 16 cautions. | "By the time he is back, Polier has read it. All of it." |
| 3 | 0:14 | | Item 3.3.10, dewatering as a lump sum "Mehrkosten gleich welcher Ursache werden nicht gesondert vergütet", and the finding beside it. | Jürgen: "Was ist das denn für eine Position? Wollen die uns verarschen?" "Polier put it more politely." |
| 4 | 0:24 | | "Take it on": 19 questions to ask, 8 packages, first prices. | "He takes it on. Polier drafts the questions, sorts the items into packages, and fills in the prices it already knows." |
| 5 | 0:32 | | He ticks a question, takes all, the letter stands there in German; sent. | "Jürgen picks what to ask. Polier writes it. In German." |
| 6 | 0:42 | | An inquiry written and sent (the other twelve off camera). | "Thirteen suppliers and subcontractors get their inquiry." |
| 7 | 0:51 | The client's reply arrives. | "The client answered!": 18 answered, 1 in part, each under its question. | "Two days later, the client answers. Jürgen does nothing. …" |
| 8 | 1:01 | | The decision on item 1.1.30: 26 weeks become 18; accepted. | "What changes on his side, he decides. Twenty-six weeks become eighteen." |
| 9 | 1:09 | The firms' replies arrive. | "Prices are in!": the quotes in their packages. | "Then the quotes come in. Read, checked, side by side." |
| 10 | 1:18 | | The package Kampfmittelsondierung: nobody to ask; firms Polier found on the web. | Jürgen: "Kampfmittelsondierung? Dafür haben wir keinen." "So Polier went and found licensed firms. In Hamburg's own register." |
| 11 | 1:28 | | The comparison of two quotes; the cheapest per item taken. | "The cheapest per item. Every price keeps its source." |
| 12 | 1:36 | | The cover sheet, fuller; what is left for the bid. | "The rest is his: his crews, his prices." |
| 13 | 1:43 | | 37 of 37 priced, 328.717,26 €; "The bid went out". | "Thirty-seven of thirty-seven. The bid goes out." |
| 14 | 1:49 | "Zuschlag" arrives. | "You won it!", the card in Award: the contract is ours. | "Three weeks later." Jürgen: "Na also." "Polier. It reads the mail, so you can build." |

Against the order Atahan gave, one thing moved: the package with nobody to ask comes after the client's
answer, because its item (1.1.70) carried an open question and waited for that answer.

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

- Nobody has listened to this cut: voices, music level, timing of the lines against the picture.
- The document in the middle filling up step by step is only hinted at (the cover sheet's rows in scenes 4 and
  12, the answers and quotes beside the items). The same items in the same framing after every step is not shot.
- Scene 13: the click on "The bid went out" did not register (the project was not marked as sent); the award
  moved it on all the same. Scene 10: "Add and ask" is pressed but nothing visibly follows.
- Polier's cheer at the award is what the app has (the call, confetti, a bounce); no dance.
- The firms found on the web in scene 10 are real ones with real addresses. No inquiry was sent to any of
  them, and the recording takes a firm it added out of the directory again. Keep it that way.
- Jürgen's voice: no German voice on the account; a library voice speaks German with an accent.
- Polier does not answer a supplier by itself (it drafts, the estimator sends): not in the film.
- The film's tender (TBA-2026-131 Fliederweg) stays in the app, won; a new take deletes it and starts afresh
  (`node make.mjs record` from s1: about fifteen minutes, a few dollars of Claude, no ElevenLabs credits).
