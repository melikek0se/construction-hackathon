# Demo video: "The Estimator"

A film-trailer parody, exactly 2:00. A deep trailer voice tells an ordinary tender week as an action film.
The picture is serious, the subject is a sewer LV: that is the joke. 34 s are staged scenes, 86 s are the
real app on the demo tender **TBA-2026-114, Erneuerung Mischwasserkanal Birkenweg, 2. BA**.

The story as data (lines, seconds, shots) is `scripts/demo_video/story.mjs`; this page is its reading copy.

## How it is made

```bash
cd scripts/demo_video && npm install      # once; needs ffmpeg and ELEVENLABS_API_KEY in .env
docker compose up                          # the app on :5173 with the demo tender
node make.mjs all                          # voice, sound, record, render, mix → out/demo.mp4, out/sheet.jpg
node make.mjs record a6 && node make.mjs render a6 && node make.mjs mix   # one shot again
```

- Voice, music and hits come from ElevenLabs and are kept in `out/` per text, so a second run costs nothing.
- The shots are recorded from the running app at twice 1080p, so the close-ups stay sharp. The recording
  only looks: it sends nothing, submits nothing, changes nothing.
- What the shots show depends on the state of the demo tender when they are recorded.

Order of work (Atahan, 2026-11-22): story, then a first cut by Claude with type on black in place of the
staged scenes (done), then the staged scenes generated on ElevenLabs Image & Video and cut in (not done).

## Characters

- **Jürgen**, estimator, mid-fifties, reading glasses on a cord, a cold coffee. Speaks German, little.
- **The narrator**, English, deep, far too dramatic. Never seen.
- **Polier**, the app. Does not speak; it shows.
- **The LV**, 78 items about a combined sewer, in four documents. The villain.

## Story

| # | Time | Picture | Sound |
|---|------|---------|-------|
| 1 | 0:00–0:08 | STAGED. Night, an office in Norderbek, 23:47. Jürgen between towers of paper. | Narrator: "In a world… where the bid is due at ten a.m. … sharp." |
| 2 | 0:08–0:15 | STAGED. The printer will not stop. Pages slide over the floor. | "One man faced a combined sewer. Seventy-eight items. Four documents. No mercy." |
| 3 | 0:15–0:21 | STAGED. Jürgen lifts one page, squints, looks into the camera. | Jürgen: "Dreißig Wochen Baustelleneinrichtung… bei zweiundzwanzig Wochen Bauzeit? Na super." |
| 4 | 0:21–0:27 | The title slams in: **POLIER**. | Hit. "This autumn… he is not alone." |
| 5 | 0:27–0:42 | APP. The board of tenders; a click on Birkenweg; its cover sheet: 18 days, Checks, Client, Prices, Bid. | "It reads every page. Every remark. Every footnote nobody reads." |
| 6 | 0:42–1:08 | APP. "Next to look at", then finding 2 of 25 in close-up: item 1.1.30, 30 weeks of site facilities against a contract period of about 22 weeks, 35.329,20 € at stake, with the quoted passage. Then three more findings, fast. | "It finds what the client hoped you would miss." Hit. "Thirty weeks of site facilities… in a twenty-two week contract. Thirty-five thousand euros. Gone." "And that… was only number two of twenty-five." |
| 7 | 1:08–1:23 | APP. The bidder question on 1.1.30 as it went out, the client's answer under it (22 weeks), then the correspondence: 15 answered. | "It asks the awkward questions. Politely. In German." "And the client… answers." |
| 8 | 1:23–1:40 | APP. An item with a supplier's quote beside it, the comparison of the quotes; then the one item with "No price: nothing to go by". | "Every price has a source. A date. A supplier who actually wrote back." "No source? No price. It says so." |
| 9 | 1:40–1:49 | APP. "Finish the bid": the bid total and what it may cost, down to the document. | "One bid. Every cent explained." |
| 10 | 1:49–1:56 | STAGED. Daylight, the same office, tidy, 16:58. Jürgen takes his jacket. | "This time… he goes home on time." Jürgen: "Feierabend." |
| 11 | 1:56–2:00 | Logo. | Hit. "Polier. Evidence included. Coffee not included." |

## What makes it funny, and what must stay true

- The voice never winks. The pathos is spent on Baustelleneinrichtung.
- Jürgen says two things in the whole film. What he stumbles over in scene 3 is what Polier finds in scene 6.
- Everything in scenes 5 to 9 is the app as it is, on the demo data. No finding, price or answer is made
  up for the video; the numbers spoken (78 items, four documents, 30 and 22 weeks, 35 thousand euros, two
  of twenty-five) are the ones on the screen and have to be checked again if the demo data changes.

## Open

- Nobody has listened to the first cut yet: voice, music level and the hits are unheard.
- Framing of the close-ups in scenes 7 and 8 is rough.
- The staged scenes (1, 2, 3, 10): one character picture first, then the clips from it.
- Team name for the last card.
