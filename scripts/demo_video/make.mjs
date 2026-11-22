// Makes the demo video from story.mjs.
//
//   node make.mjs voice            the lines spoken by ElevenLabs (kept in out/voice, made once per text)
//   node make.mjs sound            music and hits by ElevenLabs (kept in out/sound, made once per prompt)
//   node make.mjs record [id…]     the shots recorded from the running app (docker compose up) into out/shots
//   node make.mjs render [id…]     each recorded shot made into out/shots/<id>.mp4
//   node make.mjs mix              everything put together: out/demo.mp4
//   node make.mjs all              all of it, in that order
//   node make.mjs sheet            out/sheet.jpg: one frame every four seconds, to look the film over
//
// Needs ELEVENLABS_API_KEY in the repo's .env, ffmpeg, and `npm install` here.

import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP, API, MAILBOX, SHOTS, LINES, VOICES, MUSIC, HITS } from './story.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const W = 1920, H = 1080, DSF = 2, FPS = 30;
const dir = (...p) => { const d = path.join(OUT, ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = o => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10);
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const probe = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

function apiKey() {
  const env = fs.readFileSync(path.join(HERE, '..', '..', '.env'), 'utf8');
  const m = env.match(/^ELEVENLABS_API_KEY=(.*)$/m);
  if (!m) throw new Error('ELEVENLABS_API_KEY is not in .env');
  return m[1].trim().replace(/^["']|["']$/g, '');
}
async function eleven(pathname, body) {
  const r = await fetch('https://api.elevenlabs.io' + pathname, {
    method: 'POST', headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${pathname}: ${r.status} ${(await r.text()).slice(0, 400)}`);
  return Buffer.from(await r.arrayBuffer());
}

// ---------------------------------------------------------------- voice and sound

const voiceFile = l => path.join(dir('voice'), `${l.id}-${hash([l.text, VOICES[l.voice]])}.mp3`);
async function voice() {
  for (const l of LINES) {
    const f = voiceFile(l);
    if (!fs.existsSync(f)) {
      const v = VOICES[l.voice];
      fs.writeFileSync(f, await eleven(`/v1/text-to-speech/${v.id}?output_format=mp3_44100_128`,
        { text: l.text, model_id: 'eleven_multilingual_v2', voice_settings: v.settings }));
    }
  }
  // does every line end before the next one starts, and before the film does?
  let end = 0;
  for (const l of LINES) {
    const d = probe(voiceFile(l));
    const late = l.at < end ? `  ← starts ${(end - l.at).toFixed(1)} s before the line before it ends` : '';
    end = l.at + d;
    console.log(`${l.id.padEnd(4)} ${l.at.toFixed(1).padStart(6)} → ${end.toFixed(1).padStart(6)}  (${d.toFixed(1)} s)  ${l.text.slice(0, 50)}${late}`);
  }
  if (end > total()) console.log(`the last line ends at ${end.toFixed(1)} s, the film at ${total()} s`);
}

const musicFile = () => path.join(dir('sound'), `music-${hash(MUSIC)}.mp3`);
const hitFile = () => path.join(dir('sound'), `hit-${hash([HITS.prompt, HITS.seconds])}.mp3`);
async function sound() {
  if (!fs.existsSync(hitFile())) {
    try { fs.writeFileSync(hitFile(), await eleven('/v1/sound-generation', { text: HITS.prompt, duration_seconds: HITS.seconds, prompt_influence: 0.5 })); }
    catch (e) { console.log('no hit:', e.message); }
  }
  if (!fs.existsSync(musicFile())) {
    try { fs.writeFileSync(musicFile(), await eleven('/v1/music?output_format=mp3_44100_128', { prompt: MUSIC.prompt, music_length_ms: MUSIC.seconds * 1000 })); }
    catch (e) { console.log('no music:', e.message); }
  }
  for (const f of [hitFile(), musicFile()]) if (fs.existsSync(f)) console.log(path.basename(f), probe(f).toFixed(1), 's');
}

// ---------------------------------------------------------------- recording

const total = () => SHOTS.reduce((s, x) => s + x.dur, 0);
const startOf = id => { let t = 0; for (const s of SHOTS) { if (s.id === id) return t; t += s.dur; } };
const MW = 640; // the mailbox beside the app, in px of the film

// A cursor that can be seen in the recording, and a ring where it clicks.
const CURSOR = `(() => {
  if (window.__cur) return; window.__cur = true;
  const add = () => {
    const c = document.createElement('div'); c.id = 'demo-cursor';
    c.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2 L4 20 L8.6 15.8 L11.6 22.4 L14.6 21 L11.7 14.6 L18 14.4 Z" fill="#121413" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))';
    document.documentElement.appendChild(c);
    const at = JSON.parse(sessionStorage.getItem('demo-cur') || 'null'); if (at) c.style.transform = 'translate(' + at[0] + 'px,' + at[1] + 'px)';
    addEventListener('mousemove', e => { c.style.transform = 'translate(' + (e.clientX - 5) + 'px,' + (e.clientY - 3) + 'px)'; sessionStorage.setItem('demo-cur', JSON.stringify([e.clientX - 5, e.clientY - 3])); }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;left:' + (e.clientX - 26) + 'px;top:' + (e.clientY - 26) + 'px;width:52px;height:52px;border-radius:50%;border:4px solid #ffc400;box-shadow:0 0 0 2px #121413;opacity:1;transform:scale(.3);transition:transform .45s ease-out,opacity .45s ease-out';
      document.documentElement.appendChild(r); requestAnimationFrame(() => { r.style.transform = 'scale(1.25)'; r.style.opacity = '0'; }); setTimeout(() => r.remove(), 500);
    }, true);
  };
  document.documentElement ? add() : addEventListener('DOMContentLoaded', add);
})()`;

// film seconds ↔ real seconds of a shot: 1:1, except where a wait was cut short (points of a line)
const realAt = (pts, f) => { let a = pts[0]; for (const p of pts) { if (p.f <= f) a = p; } const b = pts[pts.indexOf(a) + 1];
  return b && b.f > a.f ? a.r + (f - a.f) * (b.r - a.r) / (b.f - a.f) : a.r + (f - a.f); };

async function record(ids) {
  const shots = SHOTS.filter(s => !ids.length || ids.includes(s.id));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, locale: 'en-GB' });
  await context.addInitScript(CURSOR);
  const app = await context.newPage();
  // the mailbox as on a narrow window, so that its type is large enough to read in a third of the picture
  const mailContext = await browser.newContext({ viewport: { width: 448, height: 756 }, deviceScaleFactor: 3, locale: 'de-DE' });
  const mail = await mailContext.newPage();
  await mail.goto(MAILBOX.url, { waitUntil: 'load' });
  if (await mail.locator('#rcmloginuser').count()) { // the demo mailbox of the mock world (docs: password "demo")
    await mail.fill('#rcmloginuser', MAILBOX.user); await mail.fill('#rcmloginpwd', MAILBOX.password);
    await mail.click('#rcmloginsubmit'); await mail.waitForLoadState('load'); await sleep(2500);
  }
  for (const shot of shots) {
    const d = dir('shots', shot.id);
    for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f));
    const frames = { app: [], mail: [] }, cams = [{ t: 0, r: [0, 0, W, H] }], splits = [{ t: 0, v: shot.split ? 1 : 0 }], clocks = [{ t: 0, text: shot.clock || '' }];
    const pts = [{ f: 0, r: 0 }];
    let t0 = 0, lapsing = false;
    const real = () => Date.now() / 1000 - t0;
    const now = () => { const p = pts[pts.length - 1]; return p.f + (real() - p.r); };
    const rectOf = async target => {
      const list = Array.isArray(target) ? target : [target];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const t of list) {
        if (t.boundingBox) await t.waitFor({ state: 'attached', timeout: 15000 });
        const b = t.boundingBox ? await t.boundingBox() : { x: t.x, y: t.y, width: t.w || 0, height: t.h || 0 };
        if (!b) throw new Error(`${shot.id}: nothing on the page for ${t}`);
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const c = {
      page: app, app, mail, wait: sleep, now,
      until: async s => { const left = s - now(); if (left > 0) await sleep(left * 1000); },
      // a wait that the film does not sit through: `what` (ms, or something to await) takes `film` seconds of it
      async lapse(what, film) {
        const f0 = now(), r0 = real(); lapsing = true;
        try { typeof what === 'number' ? await sleep(what) : await what(); } finally { lapsing = false; }
        pts.push({ f: f0, r: r0 }, { f: f0 + film, r: Math.max(real(), r0 + film) });
        const left = r0 + film - real(); if (left > 0) await sleep(left * 1000);
      },
      split(on, ms = 700) { const t = now(); splits.push({ t, v: splits[splits.length - 1].v }, { t: t + ms / 1000, v: on ? 1 : 0 }); },
      clock(text) { clocks.push({ t: now(), text }); },
      sh: (cmd) => new Promise((ok, no) => execFile('sh', ['-c', cmd], { cwd: path.join(HERE, '..', '..'), maxBuffer: 1 << 26 }, (e, out, err) => (e ? no(new Error(String(err || e).slice(0, 300))) : ok(out)))),
      api: async (method, p, body) => { const r = await fetch(API + p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } },
      checkmail: () => mail.evaluate(() => window.rcmail && window.rcmail.command('checkmail')),
      async move(target, ms = 800) {
        const b = target.boundingBox ? await rectOf(target) : { x: target.x, y: target.y, w: 0, h: 0 };
        await app.mouse.move(b.x + b.w / 2, b.y + Math.min(b.h / 2, 60), { steps: Math.max(2, Math.round(ms / 16)) });
      },
      async click(target, ms = 250) { await c.move(target, ms); await app.mouse.down(); await sleep(70); await app.mouse.up(); },
      // the camera goes onto an element: 16:9 around it. w: fixed width of the picture; pad: room around;
      // anchor top: the element's top at the picture's top; up, dx, dy: shifted by so many px; maxH: only so much of it
      async cam(target, ms = 1200, o = {}) {
        const b = await rectOf(target);
        if (o.maxH) b.h = Math.min(b.h, o.maxH);
        const pad = o.pad ?? 30;
        let w = o.w ?? Math.max(b.w + 2 * pad, (Math.min(b.h, 560) + 2 * pad) * 16 / 9);
        w = Math.min(W, Math.max(640, w));
        const h = w * 9 / 16;
        let x = b.x + b.w / 2 - w / 2 + (o.dx || 0);
        let y = (o.anchor === 'top' ? b.y - pad : b.y + b.h / 2 - h / 2) - (o.up || 0) + (o.dy || 0);
        x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y));
        const from = cams[cams.length - 1].r, t = now();
        cams.push({ t, r: from }, { t: t + ms / 1000, r: [x, y, w, h] });
      },
      async wide(ms = 1000) { const from = cams[cams.length - 1].r, t = now(); cams.push({ t, r: from }, { t: t + ms / 1000, r: [0, 0, W, H] }); },
      async scroll(sel, by, ms = 1200) {
        await app.evaluate(([sel, by, ms]) => new Promise(done => {
          const el = document.querySelector(sel); if (!el) return done();
          const from = el.scrollTop, to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, from + by)), t0 = performance.now();
          if (!ms) { el.scrollTop = to; return done(); }
          const e = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
          const step = t => { const k = Math.min(1, (t - t0) / ms); el.scrollTop = from + (to - from) * e(k); k < 1 ? requestAnimationFrame(step) : done(); };
          requestAnimationFrame(step);
        }), [sel, by, ms]);
      },
      // the scrolling area an element stands in, moved so that the element is at `where` (0 top … 1 bottom) of the window
      async reveal(target, ms = 1200, where = 0.45) {
        for (const pass of [ms, 250]) {
          await target.waitFor({ state: 'attached', timeout: 15000 });
          await target.evaluate(el => {
            document.querySelectorAll('[data-demo-scroll]').forEach(e => e.removeAttribute('data-demo-scroll'));
            for (let x = el.parentElement; x; x = x.parentElement) if (x.scrollHeight > x.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(x).overflowY)) { x.setAttribute('data-demo-scroll', ''); break; }
          });
          const b = await rectOf(target), off = b.y + b.h / 2 - H * where;
          if (Math.abs(off) > 30) await c.scroll('[data-demo-scroll]', off, pass);
        }
      },
    };

    if (shot.url) { await app.goto(shot.url, { waitUntil: 'load' }); await sleep(3000); }
    await app.evaluate(() => document.fonts.ready);
    let failed = null;
    try { if (shot.prep) { await shot.prep(c); await sleep(600); } } catch (e) { failed = e; }
    const casts = [];
    for (const [name, page] of [['app', app], ['mail', mail]]) {
      let n = 0, kept = 0;
      const cdp = await page.context().newCDPSession(page);
      cdp.on('Page.screencastFrame', f => {
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
        if (lapsing && f.metadata.timestamp - kept < 0.1) return; // a wait cut short needs few of its frames
        kept = f.metadata.timestamp;
        const file = `${name}-${String(n++).padStart(5, '0')}.jpg`;
        fs.writeFileSync(path.join(d, file), Buffer.from(f.data, 'base64'));
        frames[name].push({ file, t: f.metadata.timestamp });
      });
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DSF, maxHeight: H * DSF, everyNthFrame: 1 });
      casts.push(cdp);
    }
    await sleep(400);
    t0 = Date.now() / 1000;
    try { if (!failed) await shot.run(c); } catch (e) { failed = e; }
    await c.until(shot.dur + 0.15);
    for (const cdp of casts) { await cdp.send('Page.stopScreencast').catch(() => {}); await cdp.detach().catch(() => {}); }
    await sleep(200);
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ t0, dur: shot.dur, cams, splits, clocks, pts, frames }));
    console.log(`${shot.id}: ${frames.app.length}+${frames.mail.length} frames, ${real().toFixed(0)} s real${failed ? '  FAILED: ' + failed.message.split('\n')[0] : ''}`);
    if (failed) { await app.screenshot({ path: path.join(OUT, 'failed.png') }); break; }
    try { if (shot.after) await shot.after(c); } catch (e) { console.log(`${shot.id}: after it FAILED: ${e.message.split('\n')[0]}`); await app.screenshot({ path: path.join(OUT, 'failed.png') }); break; }
  }
  await browser.close();
}

// ---------------------------------------------------------------- rendering

function lineAt(keys, t) { // keys [{t, r|v}] in pairs: where the value stands at t, eased between a pair
  let a = keys[0], b = keys[0];
  for (let i = 0; i < keys.length; i++) { if (keys[i].t <= t) { a = keys[i]; b = keys[i + 1] || keys[i]; } }
  const va = a.r ?? [a.v], vb = b.r ?? [b.v];
  if (a === b || b.t <= a.t) return va;
  const k = ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
  return va.map((v, i) => v + (vb[i] - v) * k);
}

// Small pieces of type laid over the picture (the clock, what Jürgen says): made once as pictures, in the app's own faces.
async function labels(texts) {
  const made = {}, d = dir('labels');
  const need = texts.filter(t => !fs.existsSync(path.join(d, hash(t) + '.png')));
  if (need.length) {
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
    await page.goto(APP + '/', { waitUntil: 'load' }); await sleep(1500);
    for (const t of need) {
      await page.evaluate(t => {
        document.body.innerHTML = t.kind === 'clock'
          ? `<div id="l" style="display:inline-block;background:#121413;color:#ffc400;font:700 34px 'Barlow Condensed',sans-serif;letter-spacing:.12em;text-transform:uppercase;padding:8px 18px 8px 16px;border-left:10px solid #ffc400">${t.text}</div>`
          : `<div id="l" style="display:inline-block;max-width:1100px;text-align:center;background:rgba(18,20,19,.92);color:#fff;padding:14px 28px 16px;font:600 40px/1.25 'Barlow',sans-serif"><span style="color:#ffc400;font:700 26px 'Barlow Condensed',sans-serif;letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:4px">${t.who}</span>${t.text}<span style="display:block;font:500 28px/1.3 'Barlow',sans-serif;color:#c9c9c2;margin-top:6px">${t.sub || ''}</span></div>`;
        document.body.style.background = 'transparent'; document.documentElement.style.background = 'transparent';
      }, t);
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#l').screenshot({ path: path.join(d, hash(t) + '.png'), omitBackground: true });
    }
    await browser.close();
  }
  for (const t of texts) { const f = path.join(d, hash(t) + '.png'); const m = await sharp(f).metadata(); made[hash(t)] = { input: fs.readFileSync(f), w: m.width, h: m.height }; }
  return made;
}

async function render(ids) {
  const subs = LINES.filter(l => l.sub).map(l => ({ ...l, label: { kind: 'sub', who: l.who || 'Jürgen', text: l.show || l.text, sub: l.sub }, end: l.at + (fs.existsSync(voiceFile(l)) ? probe(voiceFile(l)) : 3) + 0.5 }));
  for (const shot of SHOTS.filter(s => !ids.length || ids.includes(s.id))) {
    const d = path.join(OUT, 'shots', shot.id);
    if (!fs.existsSync(path.join(d, 'meta.json'))) { console.log(shot.id, 'is not recorded'); continue; }
    const m = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8'));
    const pics = await labels([...m.clocks.filter(k => k.text).map(k => ({ kind: 'clock', text: k.text })), ...subs.map(s => s.label)]);
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(FPS), path.join(OUT, 'shots', shot.id + '.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, no) => ff.on('close', code => (code ? no(new Error('ffmpeg ' + code)) : ok())));
    const at = { app: 0, mail: 0 }, src = {};
    const frameOf = (name, r) => { const fr = m.frames[name]; if (!fr.length) return null; while (at[name] + 1 < fr.length && fr[at[name] + 1].t - m.t0 <= r) at[name]++; return fr[at[name]].file; };
    const load = async file => { if (src.file !== file) { src.file = file; src.buf = fs.readFileSync(path.join(d, file)); const md = await sharp(src.buf).metadata(); src.w = md.width; src.h = md.height; } return src; };
    let lastKey = '', buf = null, mailKept = { file: '', buf: null };
    const film0 = startOf(shot.id);
    for (let i = 0; i < Math.round(Math.min(m.dur, shot.dur) * FPS); i++) { // a shot may be cut shorter than it was recorded
      const t = i / FPS, r = realAt(m.pts, t);
      const appFile = frameOf('app', r), mailFile = frameOf('mail', r);
      const cam = lineAt(m.cams, t), s = lineAt(m.splits, t)[0];
      const clock = [...m.clocks].reverse().find(k => k.t <= t)?.text || '';
      const sub = subs.find(x => film0 + t >= x.at && film0 + t < x.end);
      const key = [appFile, s > 0 ? mailFile : '', cam.map(v => v.toFixed(1)), s.toFixed(3), clock, sub?.id].join();
      if (key !== lastKey) {
        const a = await load(appFile), k = a.w / W;
        const left = Math.round(cam[0] * k), top = Math.round(cam[1] * k);
        const width = Math.min(a.w - left, Math.round(cam[2] * k)), height = Math.min(a.h - top, Math.round(cam[3] * k));
        const aw = Math.round(W - MW * s), ah = Math.round(aw * 9 / 16), ax = W - aw, ay = Math.round((H - ah) / 2);
        const layers = [{ input: await sharp(a.buf).extract({ left, top, width, height }).resize(aw, ah, { fit: 'fill', kernel: 'lanczos3' }).png({ compressionLevel: 0 }).toBuffer(), left: ax, top: ay }];
        if (s > 0.001 && mailFile) {
          if (mailKept.file !== mailFile) mailKept = { file: mailFile, buf: await sharp(path.join(d, mailFile)).resize(MW, H, { fit: 'cover', position: 'top' }).png({ compressionLevel: 0 }).toBuffer() };
          const mx = Math.round(-MW + MW * s);
          layers.push(mx >= 0 ? { input: mailKept.buf, left: mx, top: 0 } : { input: await sharp(mailKept.buf).extract({ left: -mx, top: 0, width: MW + mx, height: H }).toBuffer(), left: 0, top: 0 });
        }
        if (clock) { const p = pics[hash({ kind: 'clock', text: clock })]; layers.push({ input: p.input, left: Math.round(40 + MW * s), top: Math.round(H - 70 - (H - 70 - 60) * s) }); }
        if (sub) { const p = pics[hash(sub.label)]; layers.push({ input: p.input, left: Math.round(MW * s + (W - MW * s) / 2 - p.w / 2), top: H - 60 - p.h }); }
        buf = await sharp({ create: { width: W, height: H, channels: 3, background: '#121413' } }).composite(layers).removeAlpha().raw().toBuffer();
        lastKey = key;
      }
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    console.log(shot.id, 'rendered');
  }
}

// ---------------------------------------------------------------- putting it together

function mix() {
  const list = path.join(OUT, 'shots.txt');
  fs.writeFileSync(list, SHOTS.map(s => `file '${path.join(OUT, 'shots', s.id + '.mp4')}'`).join('\n'));
  const T = total();
  const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  const parts = [], mixin = [];
  let k = 1;
  for (const l of LINES) {
    args.push('-i', voiceFile(l));
    parts.push(`[${k}:a]adelay=${Math.round(l.at * 1000)}:all=1,volume=1.5[v${k}]`); mixin.push(`[v${k}]`); k++;
  }
  const said = `${mixin.join('')}amix=inputs=${mixin.length}:normalize=0:dropout_transition=0,apad=whole_dur=${T}[said]`;
  let last = '[said]', graph = [...parts, said];
  const under = [];
  if (HITS.at.length && fs.existsSync(hitFile())) for (const at of HITS.at) {
    args.push('-i', hitFile()); graph.push(`[${k}:a]adelay=${Math.round(at * 1000)}:all=1,volume=0.9[h${k}]`); under.push(`[h${k}]`); k++;
  }
  if (fs.existsSync(musicFile())) {
    args.push('-i', musicFile());
    // the music goes down while somebody speaks
    graph.push(`[said]asplit=2[said1][key]`);
    const fit = Math.min(1, Math.max(0.85, probe(musicFile()) / T)); // a track a little short is played a little slower
    graph.push(`[${k}:a]atempo=${fit.toFixed(4)},atrim=0:${T},afade=t=out:st=${T - 1.2}:d=1.2,volume=0.5[m0]`);
    graph.push(`[m0][key]sidechaincompress=threshold=0.03:ratio=9:attack=40:release=500[m1]`);
    under.push('[m1]'); last = '[said1]'; k++;
  }
  graph.push(`${last}${under.join('')}amix=inputs=${under.length + 1}:normalize=0:dropout_transition=0,alimiter=limit=0.95[a]`);
  graph.push(`[0:v]fade=t=in:st=0:d=0.5,fade=t=out:st=${T - 0.5}:d=0.5[v]`);
  args.push('-filter_complex', graph.join(';'), '-map', '[v]', '-map', '[a]', '-t', String(T),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', path.join(OUT, 'demo.mp4'));
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  console.log(path.join(OUT, 'demo.mp4'), probe(path.join(OUT, 'demo.mp4')).toFixed(1), 's');
}

function sheet() {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(OUT, 'demo.mp4'), '-vf', 'fps=1/4,scale=640:-1,tile=6x5', '-frames:v', '1', path.join(OUT, 'sheet.jpg')]);
  console.log(path.join(OUT, 'sheet.jpg'));
}

const [cmd, ...ids] = process.argv.slice(2);
console.log(`the shots add up to ${total()} s`);
if (cmd === 'voice') await voice();
else if (cmd === 'sound') await sound();
else if (cmd === 'record') await record(ids);
else if (cmd === 'render') await render(ids);
else if (cmd === 'mix') mix();
else if (cmd === 'sheet') sheet();
else if (cmd === 'all') { await voice(); await sound(); await record([]); await render([]); mix(); sheet(); }
else console.log('node make.mjs voice | sound | record [id…] | render [id…] | mix | sheet | all');
export { startOf };
