// The demo video as data: what is said when, and what is on screen when. Story in docs/10-demo-video.md.
// Recording acts in the app: it lets the film's own tender arrive (tender.py), takes it on, sends mail on the
// demo mail server and submits the bid. It touches no other project.

export const APP = process.env.DEMO_APP || 'http://localhost:5173';
export const API = process.env.DEMO_API || 'http://localhost:8000';
export const MAILBOX = { url: 'http://localhost:8025/webmail/', user: 'kalkulation@polier.test', password: 'demo' }; // the mock world's estimator
const NAME = 'Fliederweg';

// ElevenLabs voices (premade): the narrator and Jürgen.
export const VOICES = {
  narrator: { id: 'nPczCjzI2devNBz1zQrb', settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, speed: 1.0 } }, // Brian
  juergen: { id: 'pqHfZKP75CvOlQylNhV4', settings: { stability: 0.4, similarity_boost: 0.8, style: 0.5, speed: 1.0 } }, // Bill
};

// What is said: `at` is the second of the film at which the line starts. `sub`: shown under the picture.
export const LINES = [
  { id: 'n1', voice: 'narrator', at: 0.4, text: "Monday, eight twelve. A tender lands in Jürgen's inbox. Jürgen is getting coffee." },
  { id: 'n2', voice: 'narrator', at: 9.3, text: 'By the time he is back, Polier has read it. All of it.' },
  { id: 'j3', voice: 'juergen', at: 15.4, text: 'Was ist das denn für eine Position? Wollen die uns verarschen?', sub: '“What kind of item is that? Are they kidding us?”' },
  { id: 'n3', voice: 'narrator', at: 20.6, text: 'Polier put it more politely.' },
  { id: 'n4', voice: 'narrator', at: 24.6, text: 'He takes it on. Polier drafts the questions, sorts the items into packages, and fills in the prices it already knows.' },
  { id: 'n5', voice: 'narrator', at: 32.8, text: 'Jürgen picks what to ask. Polier writes it. In German.' },
  { id: 'n6', voice: 'narrator', at: 43.2, text: 'Thirteen suppliers and subcontractors get their inquiry.' },
  { id: 'n8', voice: 'narrator', at: 52.0, text: 'Two days later, the client answers. Jürgen does nothing. Polier reads the reply and puts every answer where it belongs.' },
  { id: 'n9', voice: 'narrator', at: 62.0, text: 'What changes on his side, he decides. Twenty-six weeks become eighteen.' },
  { id: 'n10', voice: 'narrator', at: 70.2, text: 'Then the quotes come in. Read, checked, side by side.' },
  { id: 'j7', voice: 'juergen', at: 79.0, text: 'Kampfmittelsondierung? Dafür haben wir keinen.', sub: '“Ordnance survey? We have nobody for that.”' },
  { id: 'n7', voice: 'narrator', at: 82.6, text: "So Polier went and found licensed firms. In Hamburg's own register." },
  { id: 'n11', voice: 'narrator', at: 89.0, text: 'The cheapest per item. Every price keeps its source.' },
  { id: 'n12', voice: 'narrator', at: 96.3, text: 'The rest is his: his crews, his prices.' },
  { id: 'n13', voice: 'narrator', at: 103.2, text: 'Thirty-seven of thirty-seven. The bid goes out.' },
  { id: 'n14', voice: 'narrator', at: 109.6, text: 'Three weeks later.' },
  { id: 'j14', voice: 'juergen', at: 114.2, text: 'Na also.', sub: '“There you go.”' },
  { id: 'n15', voice: 'narrator', at: 116.0, text: 'Polier. It reads the mail, so you can build.' },
];

export const MUSIC = {
  prompt: 'Light, playful instrumental for a product demo with dry humour: pizzicato strings, soft marimba and a relaxed ' +
    'walking bass, steady and unhurried, a little mischievous, slowly growing more confident, ending on a bright, short flourish.',
  seconds: 120,
};
export const HITS = { prompt: 'Deep cinematic movie trailer boom impact with a long low tail', seconds: 3, at: [] };

// ---- the film's tender in the app ----
let ids = null;
async function tender(c) { // its project and the analysis of its LV, once it is there
  if (ids) return ids;
  const p = (await c.api('GET', '/api/catalog')).find(p => p.name.includes(NAME));
  if (!p) throw new Error('the film\'s tender is not in the app');
  ids = { id: p.id, url: `${APP}/projects/${p.id}` };
  for (let i = 0; i < p.files.length && !ids.analysis; i++) { // any analysis of the X83 names the LV: the bid is kept by project and file
    const a = (await c.api('GET', `/api/catalog/${p.id}/files/${i}`)).id, bid = a && await c.api('GET', `/api/analyses/${a}/bid`);
    if (bid && bid.rows && /\.x83$/i.test(bid.file || '')) ids.analysis = a;
  }
  return ids;
}
const P = async c => (await tender(c)).url;
const until = async (what, ms = 240000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await what()) return; await new Promise(r => setTimeout(r, 1000)); } throw new Error('waited in vain'); };

// ---- shots, in the order of the film ----
export const SHOTS = [
  // the tender arrives in the mailbox; Polier finds it and checks it
  { id: 's1', dur: 9, split: true, clock: 'Mon 08:12', async prep(c) {
      for (const p of (await c.api('GET', '/api/catalog')).filter(p => p.name.includes(NAME))) await c.api('DELETE', `/api/catalog/${p.id}`);
      ids = null;
      await c.app.goto(APP + '/', { waitUntil: 'load' }); await c.wait(3000);
      await c.scroll('.register', 60, 0);
      await c.checkmail(); await c.wait(1500);
    }, async run(c) {
      await c.cam({ x: 120, y: 345, w: 1160, h: 652 }, 0, { pad: 0 });
      await c.until(1.2);
      await c.sh('docker compose exec -T api python - send < scripts/demo_video/tender.py');
      await c.checkmail();
      await c.until(3.6);
      await c.lapse(() => c.api('POST', '/api/inbox/sweep'), 0.8);
      await c.app.locator('.register').getByText(NAME, { exact: false }).first().waitFor({ timeout: 20000 });
      await c.until(5.2);
      await c.lapse(async () => { const t = await tender(c); await c.wait(4000); await until(async () => !(await c.api('GET', '/api/runs')).some(r => JSON.stringify(r).includes(t.id) && ['running', 'queued'].includes(r.status))); await c.wait(2500); }, 3.2);
    } },
  // he opens it: checked already
  { id: 's2', dur: 5, split: true, clock: 'Mon 08:21', async run(c) {
      c.split(false, 800); await c.wide(800);
      const card = c.app.locator('.register').getByText(NAME, { exact: false }).first();
      await c.move(card, 1300);
      await c.until(2.2);
      await c.click(card);
      await c.app.locator('.td-cv').waitFor({ timeout: 10000 });
    } },
  // the item Jürgen swears about, and what Polier says about it
  { id: 's3', dur: 10, clock: 'Mon 08:22', async prep(c) {
      await c.app.goto(await P(c), { waitUntil: 'load' }); await c.wait(3000);
      await c.app.getByText('Next to look at', { exact: false }).first().click(); await c.wait(1500);
      const card = c.app.locator('.td-cd', { hasText: 'Mehrkosten gleich welcher' }).first();
      await c.reveal(card, 0, 0.42);
    }, async run(c) {
      const item = c.app.locator('.td-it', { hasText: 'Wasserhaltung für die gesamte Bauzeit' }).first();
      const card = c.app.locator('.td-cd', { hasText: 'Mehrkosten gleich welcher' }).first();
      await c.wait(700);
      await c.cam([item, card], 1500, { pad: 34, anchor: 'top' });
      await c.until(3.4);
      await c.move(item, 1000);
      await c.until(8.8);
      await c.move(card, 900);
    } },
  // "Take it on": questions, packages and the first prices come by themselves
  { id: 's4', dur: 8, clock: 'Mon 08:24', async prep(c) { await c.app.goto(await P(c), { waitUntil: 'load' }); await c.wait(3000); },
    async run(c) {
      const go = c.app.getByRole('button', { name: 'Take it on' }).first();
      await c.move(go, 1200);
      await c.until(1.8);
      await c.click(go);
      await c.lapse(() => c.app.locator('.td-brow', { hasText: 'packages to send' }).first().waitFor({ timeout: 120000 }), 2.4);
      await c.cam(c.app.locator('.td-board'), 1300, { pad: 60, up: 60 });
    } },
  // he picks the questions; the letter writes itself; it goes out
  { id: 's5', dur: 10.5, clock: 'Mon 08:31', async prep(c) { await c.app.goto((await P(c)) + '/questions', { waitUntil: 'load' }); await c.wait(3500); },
    async run(c) {
      const boxes = c.app.locator('.td-askrow input[type=checkbox]');
      await c.until(0.8);
      await c.click(boxes.nth(0), 700);
      const send = c.app.getByRole('button', { name: 'Send', exact: true });
      await c.lapse(() => send.waitFor({ timeout: 60000 }), 1.0);
      await c.until(3.2);
      const all = c.app.getByRole('button', { name: 'Take all', exact: true }).first();
      await c.click(all, 900);
      await c.lapse(4500, 1.2);
      await c.cam(c.app.locator('aside.td-compose'), 1200, { w: 1000, anchor: 'top', pad: 0 });
      await c.until(8.6);
      await c.click(send, 900);
      await c.wait(1200);
      await c.wide(1000);
    } },
  // the inquiries to suppliers and subcontractors
  { id: 's6', dur: 9, clock: 'Mon 08:40', async prep(c) {
      await c.app.goto((await P(c)) + '/prices', { waitUntil: 'load' });
      await c.app.getByRole('button', { name: 'Write the inquiry' }).first().waitFor({ timeout: 60000 }); await c.wait(1000);
    }, async run(c) {
      const write = c.app.getByRole('button', { name: 'Write the inquiry' }).first();
      const send = c.app.getByRole('button', { name: 'Send', exact: true });
      await c.move(write, 1200);
      await c.until(1.8);
      await c.click(write);
      await c.lapse(() => send.waitFor({ timeout: 60000 }), 1.2);
      await c.cam(c.app.locator('aside.td-compose'), 1200, { w: 1000, anchor: 'top', pad: 0, dy: 330 });
      await c.until(6.8);
      await c.wide(900);
      await c.until(7.9);
      await c.click(send, 600);
    }, async after(c) { // the other firms are asked too, off camera
      const write = c.app.getByRole('button', { name: 'Write the inquiry' }), send = c.app.getByRole('button', { name: 'Send', exact: true });
      await c.wait(4000);
      for (let i = 0; i < 20 && await write.count(); i++) { await write.first().click(); await send.waitFor({ timeout: 60000 }); await c.wait(600); await send.click(); await c.wait(4500); }
    } },
  // the client's answer arrives; Polier reads it and puts it at the questions
  { id: 's8', dur: 10, split: true, clock: 'Wed 10:47', async prep(c) {
      await c.app.goto((await P(c)) + '/questions', { waitUntil: 'load' }); await c.wait(3500);
      await c.sh(`docker compose exec -T api python - questions ${(await tender(c)).id} < scripts/demo_counterpart.py`);
    }, async run(c) {
      await c.until(1.0);
      await c.checkmail();
      await c.until(3.2);
      await c.lapse(() => c.api('POST', '/api/inbox/sweep'), 1.6);
      const reply = c.app.locator('aside.td-compose').getByText(/[1-9]\d* answered/).first();
      await c.lapse(() => reply.waitFor({ timeout: 40000 }), 0.4);
      await c.until(6.4);
      c.split(false, 800);
      await c.cam(reply, 1300, { w: 1000, anchor: 'top', up: 70 });
      await c.until(9.6);
      await c.reveal(reply, 3200, 0.12);
    } },
  // what the answer changes on our side: he decides
  { id: 's9', dur: 8, clock: 'Wed 10:52', async prep(c) {
      await c.app.goto((await P(c)) + '/questions', { waitUntil: 'load' }); await c.wait(3500);
      const what = c.app.getByRole('button', { name: 'What it changes on the item' }).first();
      await what.scrollIntoViewIfNeeded(); await what.click(); await c.wait(2000);
    }, async run(c) {
      const take = c.app.locator('.td-cd button.btn').first();
      await c.wait(600);
      await c.reveal(take, 1800, 0.8);
      await c.cam(take, 1300, { w: 1250, dx: -300, up: 240 });
      await c.until(5.0);
      await c.click(take, 900);
      await c.until(7.2);
      await c.wide(1100);
    } },
  // the firms answer; Polier reads the quotes and compares them
  { id: 's10', dur: 9, split: true, clock: 'Thu 16:20', async prep(c) {
      await c.app.goto((await P(c)) + '/prices', { waitUntil: 'load' });
      await c.app.getByRole('button', { name: 'Plan again' }).waitFor({ timeout: 60000 }); await c.wait(1500);
    }, async run(c) {
      await c.until(0.8);
      await c.checkmail();
      await c.until(3.0);
      await c.lapse(() => c.api('POST', '/api/inbox/sweep'), 1.6);
      const quote = c.app.locator('aside.td-compose').getByText('Quote in', { exact: false }).first();
      await c.lapse(() => quote.waitFor({ timeout: 60000 }), 0.4);
      await c.until(6.0);
      c.split(false, 800);
      await c.until(7.0);
      await c.cam(quote, 1300, { w: 1000, anchor: 'top', up: 150, dx: 250 });
    } },
  // a package nobody in the directory does: Polier has looked on the web. The firms it finds are real ones:
  // one is added on camera, and NO inquiry is ever sent to it (after(): it is taken out of the directory again).
  { id: 's7', dur: 10, clock: 'Thu 16:31', async prep(c) {
      await c.app.goto((await P(c)) + '/prices', { waitUntil: 'load' });
      const nobody = c.app.locator('.sup-nobody').first();
      await nobody.waitFor({ timeout: 60000 });
      for (let i = 0; i < 90 && (await nobody.innerText()).includes('SEARCHING'); i++) await c.wait(2000);
      await c.reveal(nobody, 0, 0.5); await c.wait(500);
    }, async run(c) {
      const nobody = c.app.locator('.sup-nobody').first();
      await c.wait(900);
      await c.cam(nobody, 1300, { w: 1060, anchor: 'top', up: 190 });
      await c.until(8.2);
      const add = nobody.getByRole('button', { name: 'Add and ask' }).first();
      await c.click(add, 1000);
    }, async after(c) {
      await c.wait(3000);
      for (const s of await c.api('GET', '/api/suppliers')) if (/kampfmittel/i.test(s.name) && !/\.test$/.test(s.email || '')) await c.api('DELETE', `/api/suppliers/${s.id}`);
    } },
  // the quotes side by side; he takes the cheapest
  { id: 's11', dur: 7.5, clock: 'Thu 16:40', async prep(c) {
      await c.app.goto((await P(c)) + '/prices', { waitUntil: 'load' });
      const take = c.app.getByRole('button', { name: /Take the cheapest per item/ }).first();
      await take.waitFor({ timeout: 60000 });
      await c.reveal(take, 0, 0.72); await c.wait(500);
    }, async run(c) {
      const take = c.app.getByRole('button', { name: /Take the cheapest per item/ }).first();
      await c.wait(600);
      await c.cam(take, 1300, { w: 1060, up: 250 });
      await c.until(5.2);
      await c.click(take, 1000);
    }, async after(c) { // the other packages, the rest of the decisions and Jürgen's own prices, off camera
      const t = await tender(c), A = `/api/analyses/${t.analysis}`;
      await c.wait(2500);
      for (const p of (await c.api('GET', A + '/supply')).packages) if (!p.chosen && p.comparison.columns.length) await c.api('POST', A + '/supply/choose', { package: p.id, mode: 'split' });
      await c.api('POST', A + '/supply/to-bid');
      for (const a of (await c.api('GET', A + '/questions')).amendments) if (a.status === 'proposed') await c.api('PATCH', `/api/amendments/${a.id}`, { status: 'accepted' });
    } },
  // the cover sheet again: more on it than before
  { id: 'b1', dur: 3, clock: 'Thu 16:45', async prep(c) { await c.app.goto(await P(c), { waitUntil: 'load' }); await c.wait(3500); },
    async run(c) { await c.wait(500); await c.cam(c.app.locator('.td-board'), 1300, { pad: 60, up: 60 }); } },
  // what is left for him
  { id: 's12', dur: 4, clock: 'Fri 09:10', async prep(c) { await c.app.goto((await P(c)) + '/bid', { waitUntil: 'load' }); await c.wait(4000); },
    async run(c) {
      await c.wait(500);
      await c.cam(c.app.locator('aside.td-compose'), 1300, { w: 1000, anchor: 'top', pad: 0 });
    }, async after(c) { // his own work, priced by him (here: by the script, as he would)
      const t = await tender(c), A = `/api/analyses/${t.analysis}`;
      const OWN = { '1.1.10': 18500, '1.1.20': 6200, '1.1.30': 1150, '1.1.60': 4200, '1.1.70': 14.5, '1.2.10': 9800, '1.2.40': 185, '2.1.10': 4.8, '2.1.20': 14.5, '2.1.50': 9.2,
        '3.1.10': 165, '3.1.20': 16.8, '3.1.40': 38, '3.1.50': 44.73, '3.3.10': 24500, '3.3.20': 890, '4.1.10': 28, '5.1.30': 145, '7.1.70': 2400 };
      const prices = {};
      for (const r of (await c.api('GET', A + '/bid')).rows) {
        if (r.unit_price) continue;
        if (OWN[r.item_oz]) prices[r.item_oz] = OWN[r.item_oz].toFixed(2);
        else if (r.material) await c.api('PUT', A + '/bid/build', { oz: r.item_oz, material: r.material.unit_price, waste: 3, hours: 0.2, wage: 58, equipment: Math.round(r.material.unit_price * 8) / 100, surcharge: 18 });
        else prices[r.item_oz] = (r.suggestion?.unit_price ?? 95).toFixed(2);
      }
      await c.api('PUT', A + '/bid', { prices });
    } },
  // every item priced: the bid goes out
  { id: 's13', dur: 6, clock: 'Fri 15:30', async prep(c) { await c.app.goto((await P(c)) + '/bid', { waitUntil: 'load' }); await c.wait(4000); },
    async run(c) {
      const out = c.app.getByRole('button', { name: 'The bid went out' }).first();
      await c.wait(400);
      await c.cam(c.app.getByText('Bid total, net', { exact: false }).first(), 1200, { w: 1000, anchor: 'top', up: 130 });
      await c.until(3.2);
      await c.wide(700);
      await c.reveal(out, 800, 0.6);
      await c.click(out, 800);
    } },
  // three weeks later: the award arrives
  { id: 's14', dur: 11, split: true, clock: '3 weeks later', async prep(c) {
      await c.app.goto(APP + '/', { waitUntil: 'load' }); await c.wait(3500);
      await c.scroll('.register', 60, 0);
      await c.sh(`docker compose exec -T api python - award ${(await tender(c)).analysis} < scripts/demo_video/tender.py`);
    }, async run(c) {
      await c.cam({ x: 560, y: 345, w: 1160, h: 652 }, 0, { pad: 0 });
      await c.until(1.0);
      await c.checkmail();
      await c.until(3.4);
      await c.lapse(() => c.api('POST', '/api/inbox/sweep'), 1.2);
      await c.until(6.0);
      c.split(false, 900); await c.wide(900);
    } },
];
