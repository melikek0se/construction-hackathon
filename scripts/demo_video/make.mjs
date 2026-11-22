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
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP, SHOTS, LINES, VOICES, MUSIC, HITS } from './story.mjs';

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

function cardHtml(c, dur) {
  const dark = c.kind !== 'light';
  const bg = c.kind === 'title' ? '#ffc400' : dark ? '#0b0c0b' : '#f4f4ef';
  const fg = c.kind === 'title' ? '#121413' : dark ? '#f4f4ef' : '#121413';
  const logo = `<svg viewBox="5 12 58 36" style="height:.62em;vertical-align:-.02em;margin-right:.14em"><path d="M9 41 C9 25 18.5 14 31.5 14 C44 14 52 23.5 53 38 L53.5 41 Z" fill="#121413"/><path d="M5 40.5 H52 C56.5 40.5 60 41.8 61.5 44 C62.2 45.3 61.4 46.8 59.8 46.8 H7 C5 46.8 4 44.5 5 40.5 Z" fill="#121413"/><path d="M7 40.6 H52" stroke="#ffc400" stroke-width="1.6"/><path d="M16 39.5 C16.5 29 21.5 21 29 17.5" fill="none" stroke="#ffc400" stroke-width="2.4" stroke-linecap="round"/><path d="M25 39.5 C25.5 30 30 23 37 19" fill="none" stroke="#ffc400" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const lines = c.lines.map(l => `<div class="l${l.mark ? ' mark' : ''}${l.quiet ? ' quiet' : ''}" style="font-size:${l.size}px;animation-delay:${l.at}s">${l.logo ? logo : ''}<span>${l.text}</span></div>`).join('');
  return `<style>
    #card{position:fixed;inset:0;z-index:99999;background:${bg};color:${fg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
      font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.01em;overflow:hidden}
    #card .bar{position:absolute;left:0;right:0;height:${c.kind === 'title' ? 46 : 26}px;background:repeating-linear-gradient(-45deg,#121413 0 16px,#ffc400 16px 32px)}
    #card .bar.t{top:0}#card .bar.b{bottom:0}
    #card .l{line-height:1.02;opacity:0;transform:translateY(26px) scale(1.06);animation:in .5s cubic-bezier(.2,.9,.2,1) forwards;white-space:nowrap}
    #card .l.mark span{background:#ffc400;color:#121413;padding:0 .16em}
    #card .l.quiet{font-family:"Barlow",system-ui,sans-serif;font-weight:500;text-transform:none;font-style:italic;margin-top:34px}
    ${c.kind === 'quote' ? '#card .l{text-transform:none;font-family:"Barlow",system-ui,sans-serif;font-weight:600;letter-spacing:0}' : ''}
    ${c.kind === 'title' ? '#card .l:first-of-type{animation:slam .42s cubic-bezier(.2,1.4,.3,1) forwards;letter-spacing:.02em}#card .l+.l{letter-spacing:.14em;margin-top:6px}' : ''}
    #card .corner{position:absolute;left:70px;top:70px;font-size:34px;letter-spacing:.16em;opacity:.62}
    #card .corner i{display:inline-block;width:14px;height:14px;background:#c4161c;border-radius:50%;margin-right:16px;animation:blink 1s steps(2) infinite}
    #card .sub{position:absolute;bottom:92px;left:0;right:0;text-align:center;font:500 36px "Barlow",system-ui,sans-serif;text-transform:none;letter-spacing:0;opacity:0;animation:in .6s .6s forwards}
    #card .staged{position:absolute;right:70px;bottom:62px;font:500 24px "Barlow",system-ui,sans-serif;text-transform:none;letter-spacing:0;opacity:.38}
    #card .zoom{display:flex;flex-direction:column;align-items:center;gap:10px;animation:drift ${dur}s linear forwards}
    @keyframes in{to{opacity:1;transform:none}}
    @keyframes slam{0%{opacity:0;transform:scale(2.6)}60%{opacity:1}100%{opacity:1;transform:none}}
    @keyframes drift{from{transform:scale(1)}to{transform:scale(1.07)}}
    @keyframes blink{50%{opacity:.15}}
  </style><div id="card"><div class="bar t"></div><div class="bar b"></div>
    ${c.corner ? `<div class="corner"><i></i>${c.corner}</div>` : ''}<div class="zoom">${lines}</div>
    ${c.sub ? `<div class="sub">${c.sub}</div>` : ''}${c.staged ? `<div class="staged">scene to come: ${c.staged}</div>` : ''}</div>`;
}

async function record(ids) {
  const shots = SHOTS.filter(s => !ids.length || ids.includes(s.id));
  const browser = await chromium.launch();
  for (const shot of shots) {
    const d = dir('shots', shot.id);
    for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f));
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, locale: 'en-GB' });
    await context.addInitScript(CURSOR);
    const page = await context.newPage();
    await page.goto(shot.card ? APP + '/' : shot.url, { waitUntil: 'load' });
    await page.waitForTimeout(shot.card ? 1500 : 3000);
    await page.evaluate(() => document.fonts.ready);

    const frames = [], cams = [{ t: 0, r: [0, 0, W, H] }];
    let t0 = 0, n = 0;
    const now = () => Date.now() / 1000 - t0;
    const rectOf = async target => {
      const list = Array.isArray(target) ? target : [target];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const t of list) {
        if (t.boundingBox) await t.waitFor({ state: 'attached', timeout: 10000 });
        const b = t.x !== undefined && !t.boundingBox ? { x: t.x, y: t.y, width: t.w || 0, height: t.h || 0 } : await t.boundingBox();
        if (!b) throw new Error(`${shot.id}: nothing on the page for ${t}`);
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const c = {
      page,
      wait: sleep,
      until: async s => { const left = s - now(); if (left > 0) await sleep(left * 1000); },
      // the cursor goes to the middle of an element, or to a point
      async move(target, ms = 800) {
        const b = target.boundingBox ? await rectOf(target) : { x: target.x, y: target.y, w: 0, h: 0 };
        await page.mouse.move(b.x + b.w / 2, b.y + Math.min(b.h / 2, 60), { steps: Math.max(2, Math.round(ms / 16)) });
      },
      async click(target) { await c.move(target, 250); await page.mouse.down(); await sleep(70); await page.mouse.up(); },
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
      // a scrolling area moved by so many px, eased
      async scroll(sel, by, ms = 1200) {
        await page.evaluate(([sel, by, ms]) => new Promise(done => {
          const el = document.querySelector(sel); if (!el) return done();
          const from = el.scrollTop, to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, from + by)), t0 = performance.now();
          if (!ms) { el.scrollTop = to; return done(); }
          const e = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
          const step = t => { const k = Math.min(1, (t - t0) / ms); el.scrollTop = from + (to - from) * e(k); k < 1 ? requestAnimationFrame(step) : done(); };
          requestAnimationFrame(step);
        }), [sel, by, ms]);
      },
      // a scrolling area moved so that an element stands at `where` (0 top … 1 bottom) of the window
      async reveal(target, sel, ms = 1200, where = 0.45) {
        if (!sel) { // the area that scrolls is whichever one the element stands in
          await target.evaluate(el => {
            document.querySelectorAll('[data-demo-scroll]').forEach(e => e.removeAttribute('data-demo-scroll'));
            for (let x = el.parentElement; x; x = x.parentElement) if (x.scrollHeight > x.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(x).overflowY)) { x.setAttribute('data-demo-scroll', ''); break; }
          });
          sel = '[data-demo-scroll]';
        }
        const b = await rectOf(target);
        await c.scroll(sel, b.y + b.h / 2 - H * where, ms);
        const after = await rectOf(target); // the page may have moved under it: once more, without a show
        if (Math.abs(after.y + after.h / 2 - H * where) > 40) await c.scroll(sel, after.y + after.h / 2 - H * where, 250);
      },
    };

    if (shot.prep) { await shot.prep(c); await sleep(600); }
    const cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', f => {
      const file = String(n++).padStart(5, '0') + '.jpg';
      fs.writeFileSync(path.join(d, file), Buffer.from(f.data, 'base64'));
      frames.push({ file, t: f.metadata.timestamp });
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: W * DSF, maxHeight: H * DSF, everyNthFrame: 1 });
    await sleep(400);
    t0 = Date.now() / 1000;
    let failed = null;
    try {
      if (shot.card) await page.evaluate(html => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); }, cardHtml(shot.card, shot.dur));
      else await shot.run(c);
    } catch (e) { failed = e; }
    await c.until(shot.dur + 0.15);
    await cdp.send('Page.stopScreencast');
    await sleep(200);
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ t0, dur: shot.dur, cams, frames }));
    console.log(`${shot.id}: ${frames.length} frames${failed ? '  FAILED: ' + failed.message.split('\n')[0] : ''}`);
    await context.close();
  }
  await browser.close();
}

// ---------------------------------------------------------------- rendering

function camAt(cams, t) {
  let a = cams[0], b = cams[0];
  for (let i = 0; i < cams.length; i++) { if (cams[i].t <= t) { a = cams[i]; b = cams[i + 1] || cams[i]; } }
  if (a === b || b.t <= a.t) return a.r;
  const k = ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
  return a.r.map((v, i) => v + (b.r[i] - v) * k);
}

async function render(ids) {
  for (const shot of SHOTS.filter(s => !ids.length || ids.includes(s.id))) {
    const d = path.join(OUT, 'shots', shot.id);
    if (!fs.existsSync(path.join(d, 'meta.json'))) { console.log(shot.id, 'is not recorded'); continue; }
    const m = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8'));
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(FPS), path.join(OUT, 'shots', shot.id + '.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, no) => ff.on('close', code => (code ? no(new Error('ffmpeg ' + code)) : ok())));
    let fi = 0, lastKey = '', buf = null, src = null, srcFile = '', sw = 0, sh = 0;
    for (let i = 0; i < Math.round(m.dur * FPS); i++) {
      const t = i / FPS;
      while (fi + 1 < m.frames.length && m.frames[fi + 1].t - m.t0 <= t) fi++;
      const f = m.frames[fi], r = camAt(m.cams, t);
      const key = f.file + r.map(v => v.toFixed(1)).join();
      if (key !== lastKey) {
        if (f.file !== srcFile) { src = fs.readFileSync(path.join(d, f.file)); const md = await sharp(src).metadata(); sw = md.width; sh = md.height; srcFile = f.file; }
        const k = sw / W;
        const left = Math.round(r[0] * k), top = Math.round(r[1] * k);
        const width = Math.min(sw - left, Math.round(r[2] * k)), height = Math.min(sh - top, Math.round(r[3] * k));
        buf = await sharp(src).extract({ left, top, width, height }).resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
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
  if (fs.existsSync(hitFile())) for (const at of HITS.at) {
    args.push('-i', hitFile()); graph.push(`[${k}:a]adelay=${Math.round(at * 1000)}:all=1,volume=0.9[h${k}]`); under.push(`[h${k}]`); k++;
  }
  if (fs.existsSync(musicFile())) {
    args.push('-i', musicFile());
    // the music goes down while somebody speaks
    graph.push(`[said]asplit=2[said1][key]`);
    graph.push(`[${k}:a]atrim=0:${T},afade=t=out:st=${T - 1.2}:d=1.2,volume=0.55[m0]`);
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
if (total() !== 120) console.log(`the shots add up to ${total()} s`);
if (cmd === 'voice') await voice();
else if (cmd === 'sound') await sound();
else if (cmd === 'record') await record(ids);
else if (cmd === 'render') await render(ids);
else if (cmd === 'mix') mix();
else if (cmd === 'sheet') sheet();
else if (cmd === 'all') { await voice(); await sound(); await record([]); await render([]); mix(); sheet(); }
else console.log('node make.mjs voice | sound | record [id…] | render [id…] | mix | sheet | all');
export { startOf };
