// The demo video as data: what is said when, and what is on screen when. Story in docs/10-demo-video.md.
// `node make.mjs all` makes out/demo.mp4 from it; nothing here sends, submits or changes anything in the app.

export const APP = process.env.DEMO_APP || 'http://localhost:5173';
export const TENDER = process.env.DEMO_TENDER || 'ca7c46fd04dc'; // TBA-2026-114 Mischwasserkanal Birkenweg
const P = `${APP}/projects/${TENDER}`;

// ElevenLabs voices (premade): the trailer voice and Jürgen.
export const VOICES = {
  narrator: { id: 'nPczCjzI2devNBz1zQrb', settings: { stability: 0.32, similarity_boost: 0.8, style: 0.65, speed: 0.92 } }, // Brian
  juergen: { id: 'pqHfZKP75CvOlQylNhV4', settings: { stability: 0.45, similarity_boost: 0.8, style: 0.4, speed: 0.95 } }, // Bill
};

// What is said: `at` is the second of the film at which the line starts.
export const LINES = [
  { id: 'n1', voice: 'narrator', at: 0.7, text: 'In a world… where the bid is due at ten a.m. … sharp.' },
  { id: 'n2', voice: 'narrator', at: 8.3, text: 'One man faced a combined sewer. Seventy-eight items. Four documents. No mercy.' },
  { id: 'j3', voice: 'juergen', at: 15.4, text: 'Dreißig Wochen Baustelleneinrichtung… bei zweiundzwanzig Wochen Bauzeit? Na super.' },
  { id: 'n4', voice: 'narrator', at: 22.6, text: 'This autumn… he is not alone.' },
  { id: 'n5', voice: 'narrator', at: 28.6, text: 'It reads every page. Every remark. Every footnote nobody reads.' },
  { id: 'n6a', voice: 'narrator', at: 43.0, text: 'It finds what the client hoped you would miss.' },
  { id: 'n6b', voice: 'narrator', at: 49.6, text: 'Thirty weeks of site facilities… in a twenty-two week contract. Thirty-five thousand euros. Gone.' },
  { id: 'n6c', voice: 'narrator', at: 61.2, text: 'And that… was only number two of twenty-five.' },
  { id: 'n7a', voice: 'narrator', at: 68.8, text: 'It asks the awkward questions. Politely. In German.' },
  { id: 'n7b', voice: 'narrator', at: 77.0, text: 'And the client… answers.' },
  { id: 'n8a', voice: 'narrator', at: 83.8, text: 'Every price has a source. A date. A supplier who actually wrote back.' },
  { id: 'n8b', voice: 'narrator', at: 93.4, text: 'No source? No price. It says so.' },
  { id: 'n9', voice: 'narrator', at: 100.8, text: 'One bid. Every cent explained.' },
  { id: 'n10', voice: 'narrator', at: 109.4, text: 'This time… he goes home on time.' },
  { id: 'j10', voice: 'juergen', at: 113.4, text: 'Feierabend.' },
  { id: 'n11', voice: 'narrator', at: 115.9, text: 'Polier. Evidence included. Coffee not included.' },
];

// Sound: one bed of music under everything, and hits at the seconds given.
export const MUSIC = {
  prompt:
    'Over-the-top epic movie trailer score, instrumental only. Starts with a lonely ticking clock and a low drone for ' +
    'twenty seconds, one huge braam impact, then a driving heroic orchestral build with pounding drums and brass ' +
    'that keeps rising, and a triumphant final hit at the end. Deadly serious, almost comically grand.',
  seconds: 120,
};
export const HITS = { prompt: 'Deep cinematic movie trailer boom impact with a long low tail', seconds: 3, at: [21.1, 49.4, 116.0] };

// ---- cards: the staged scenes stand in as type on black until the generated clips are cut in ----
// Each line of a card comes in at `at` seconds of the card.
const card = (kind, lines, extra = {}) => ({ kind, lines, ...extra });

// ---- shots: in the order of the film; `dur` seconds each, 120 in all ----
export const SHOTS = [
  { id: 'c1', dur: 8, card: card('dark', [
      { at: 0.6, text: 'In a world', size: 150 },
      { at: 2.4, text: 'where the bid is due', size: 110 },
      { at: 4.6, text: 'at 10:00 a.m. sharp', size: 150, mark: true },
    ], { corner: 'Norderbek · 23:47', staged: 'Night. An office. Jürgen between towers of paper.' }) },
  { id: 'c2', dur: 7, card: card('dark', [
      { at: 0.3, text: 'One man.', size: 130 },
      { at: 1.5, text: 'One combined sewer.', size: 130 },
      { at: 3.2, text: '78 items. 4 documents.', size: 110 },
      { at: 5.2, text: 'No mercy.', size: 170, mark: true },
    ], { corner: 'Norderbek · 23:52', staged: 'The printer will not stop.' }) },
  { id: 'c3', dur: 6, card: card('quote', [
      { at: 0.4, text: '„30 Wochen Baustelleneinrichtung…', size: 92 },
      { at: 2.3, text: '…bei 22 Wochen Bauzeit?“', size: 92 },
      { at: 4.4, text: '„Na super.“', size: 150, mark: true },
    ], { corner: 'Jürgen · estimator', sub: '“Thirty weeks of site facilities… in a twenty-two week contract? Oh, great.”' }) },
  { id: 'c4', dur: 6, card: card('title', [
      { at: 0.15, text: 'POLIER', size: 420, logo: true },
      { at: 1.8, text: 'This autumn · he is not alone', size: 64 },
    ]) },

  // the tender on the board, then its cover sheet
  { id: 'a5', dur: 15, url: APP + '/', async run(c) {
      await c.wait(900);
      await c.move({ x: 1030, y: 196 }, 1100);            // the schedule: where the tender is due
      await c.wait(500);
      const cardTitle = c.page.locator('.register').getByText('Mischwasserkanal Birkenweg', { exact: false }).first();
      await c.reveal(cardTitle, '.register', 1300, 0.5);
      await c.move(cardTitle, 900);
      await c.until(6.4);
      await c.click(cardTitle);
      await c.page.locator('.td-cv').waitFor({ timeout: 8000 });
      await c.until(8.6);
      await c.cam(c.page.locator('.td-cv .td-board'), 1600, { pad: 70, up: 190 });
      await c.until(12.4);
      await c.move(c.page.locator('.td-brow').first(), 900);
    } },

  // the findings: number two of twenty-five is the one with 35.329,20 € at stake
  { id: 'a6', dur: 26, url: P, async run(c) {
      const next = c.page.getByText('Next to look at', { exact: false }).first();
      await c.move(next, 1100);
      await c.until(1.9);
      await c.click(next);
      const fwd = c.page.locator('button', { hasText: '›' }).first();
      await c.until(3.4);
      await c.move(fwd, 800);
      await c.until(4.8);
      await c.click(fwd);
      const finding = c.page.locator('.td-cd', { hasText: '30 weeks of site facilities' }).first();
      await finding.waitFor({ timeout: 8000 });
      await c.until(6.6);
      await c.cam([c.page.locator('.td-it', { hasText: 'Baustelleneinrichtung vorhalten' }).first(), finding], 1500, { pad: 30, anchor: 'top' });
      await c.until(11.2);
      await c.cam(finding, 1400, { pad: 26, anchor: 'top', maxH: 400 });
      await c.until(18.6);
      await c.wide(1100);
      for (const t of [20.2, 22.0, 23.8]) { await c.until(t - 0.5); await c.move(fwd, 300); await c.until(t); await c.click(fwd); }
    } },

  // the question that went out and the client's answer that came back
  { id: 'a7', dur: 15, url: P + '/questions', async run(c) {
      const q = c.page.locator('.td-cd', { hasText: 'Ask again' }).first();
      await c.wait(700);
      await c.cam(q, 1400, { pad: 30, anchor: 'top', dy: 300 });
      await c.until(4.2);
      await c.scroll('.td-page', 330, 1500);
      await c.until(8.0);
      const reply = c.page.locator('aside').getByText('answered', { exact: false }).first();
      await c.cam(reply, 1500, { w: 900, anchor: 'top', up: 40 });
      await c.until(10.6);
      await c.scroll('aside', 420, 3600);
    } },

  // prices: a quote that came in, then the comparison
  { id: 'a8a', dur: 10, url: P + '/prices', async run(c) {
      const quote = c.page.locator('.td-cd', { hasText: 'quote for this tender' }).first();
      await c.wait(600);
      await c.cam([c.page.locator('.td-it', { hasText: 'Bodenaustausch' }).first(), quote], 1400, { pad: 30, anchor: 'top' });
      await c.until(5.0);
      const table = c.page.getByText('Nordrohr Handel GmbH', { exact: false }).last();
      await c.reveal(table, null, 1200, 0.35);
      await c.cam(table, 1300, { w: 880, anchor: 'top', up: 120 });
    } },
  // …and the item with nothing to go by
  { id: 'a8b', dur: 7, url: P + '/bid', async prep(c) {
      await c.reveal(c.page.locator('.td-cd', { hasText: 'Nothing to go by' }).first(), '.td-page', 0, 0.4);
    }, async run(c) {
      const none = c.page.locator('.td-cd', { hasText: 'Nothing to go by' }).first();
      await c.wait(500);
      await c.cam(none, 1300, { w: 1150, dx: -330, anchor: 'mid' });
      await c.until(3.6);
      await c.move(none, 900);
    } },

  // the bid
  { id: 'a9', dur: 9, url: P + '/bid', async run(c) {
      const total = c.page.locator('aside').getByText('Bid total, net', { exact: false }).first();
      await c.wait(500);
      await c.cam(total, 1500, { w: 960, anchor: 'top', up: 90 });
      await c.until(4.6);
      await c.wide(1200);
      await c.scroll('aside', 99999, 2600);
    } },

  { id: 'c10', dur: 7, card: card('light', [
      { at: 0.4, text: 'This time', size: 130 },
      { at: 1.6, text: 'he goes home', size: 130 },
      { at: 2.6, text: 'on time.', size: 190, mark: true },
      { at: 4.3, text: '„Feierabend.“', size: 90, quiet: true },
    ], { corner: 'Norderbek · 16:58', staged: 'Daylight. A tidy desk. Jürgen takes his jacket.' }) },
  { id: 'c11', dur: 4, card: card('title', [
      { at: 0.1, text: 'POLIER', size: 300, logo: true },
      { at: 1.0, text: 'Evidence included · coffee not included', size: 56 },
    ]) },
];
