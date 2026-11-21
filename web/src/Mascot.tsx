/* Polier, the agent: a matte sphere with two eyes and a yellow hard hat, in real 3D (three.js).

   What it does:
   - follows the pointer with its eyes first, then its head (a spring, so the turn overshoots a little and
     settles); the hat sits on the head and lags the turn
   - when the pointer rests, it glances around on its own: at the page, at you, a tilt of the head
   - when the pointer comes close it leans in; over it, it looks at you and smiles with its eyes
   - click: it crouches, hops, lands with a squash; files dragged over the page: it bounces, excited
   - blinks at random, sometimes twice, and on big gaze shifts
   - now and then it turns its back, in a three-quarter turn (the cheeks to one side, the face free on the other), shows two
     big round cheeks (the body itself swelling out, so the only line is the cleft between them) and bounces them up and down together (long on the way up, piled flat and wide at the
     bottom), looking
     back at you over its shoulder (the eyes slide round the head) with lowered lids, a blush and a wink, then
     turns to the front again
   - the strip (never on its own, only when asked): a pole dance, at full size. The free mascot draws on a
     canvas three times its box (up and to the left, where the page has room), so it can leave its corner.
     A scaffold tube drops in beside it and two round hands in yellow gloves appear (only for the strip);
     it takes hold and sways, swings round the tube twice with one arm
     flung out (really going round: it faces the way it travels, so its back and cheeks come into view on
     every turn, the eyes looking back over the shoulder), climbs hand over hand with a turn, tips upside down and spirals down, backs up to the tube and
     bounces its cheeks against it while a hand slaps them twice, then faces you, blows a kiss (hearts), tips
     the hard hat with a hand, and the tube goes up again and the hands are gone
   Other code can make it react:
   window.dispatchEvent(new CustomEvent("polier", { detail: "hop" | "excited" | "moon" | "strip" })).
   Typing "popo" anywhere on the page does the turn-around at once, typing "strip" the strip, typing "split"
   the split: it turns its back, the two hands take hold of the cheeks, squeeze, and pull them apart (sideways, at their own height;
   still together at the top and the bottom, an almond-shaped gap between), and there is an "x" between them; then they let go, the cheeks snap shut and wobble, and it turns round again.
   The system's "reduce motion" setting is not read anywhere in the app (D-038); `calm` below is the slow
   variant (only follows and blinks), kept switched off. */
import { useEffect, useRef } from "react";
import * as THREE from "three";

// one pointer and one drag state for every mascot on the page
const pointer = { x: -1, y: -1, at: -1e9 };
let dragging = false;
if (typeof window !== "undefined") {
  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = performance.now();
  });
  // the secret words, typed anywhere on the page: "popo" makes it turn its back at once, "strip" starts the strip
  const WORDS: Record<string, string> = { popo: "moon", strip: "strip", split: "split" };
  let typed = "";
  window.addEventListener("keydown", (e) => {
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    typed = (typed + e.key.toLowerCase()).slice(-8);
    for (const word in WORDS)
      if (typed.endsWith(word)) {
        typed = "";
        window.dispatchEvent(new CustomEvent("polier", { detail: WORDS[word] }));
      }
  });
  window.addEventListener("dragenter", () => (dragging = true));
  window.addEventListener("drop", () => (dragging = false));
  window.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) dragging = false;
  });
}

const matte = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });
const clamp = THREE.MathUtils.clamp;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// the cheeks: two balls of radius `r` low on the back, their centres at (±x, CHEEK_Y, z); `fillet` is how far the
// rim where they leave the body is rounded off
const CHEEK_Y = -0.44;
const CHEEK = { x: 0.37, z: -0.62, r: 0.64, fillet: 0.2 };

function buildRig() {
  const rig = new THREE.Group(); // hop and squash
  const head = new THREE.Group(); // turns
  rig.add(head);
  const BODY_W = 160, BODY_H = 112; // the body's grid: `shapeCheeks` relies on its layout (rows of BODY_W + 1 points)
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, BODY_W, BODY_H), matte(0xf2f1ec));
  head.add(body);

  // eyes on a pivot at the head's centre: turning the pivot slides them over the surface
  const eyePivot = new THREE.Group();
  head.add(eyePivot);
  const eyes: THREE.Mesh[] = [];
  const eyeGeo = new THREE.CapsuleGeometry(0.085, 0.2, 8, 24);
  const eyeMat = matte(0x161816);
  for (const x of [-0.3, 0.3]) {
    const y = 0.02;
    const n = new THREE.Vector3(x, y, Math.sqrt(1 - x * x - y * y));
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.copy(n).multiplyScalar(0.985);
    e.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    e.scale.z = 0.4;
    eyePivot.add(e);
    eyes.push(e);
  }

  // a blush under each eye, shown only with the look over the shoulder
  const blush = new THREE.MeshStandardMaterial({ color: 0xff7f9c, roughness: 0.9, transparent: true, opacity: 0 });
  const blushGeo = new THREE.SphereGeometry(0.12, 24, 16);
  for (const x of [-0.4, 0.4]) {
    const y = -0.27;
    const n = new THREE.Vector3(x, y, Math.sqrt(1 - x * x - y * y));
    const b = new THREE.Mesh(blushGeo, blush);
    b.position.copy(n).multiplyScalar(0.985);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    b.scale.set(1.25, 0.8, 0.2);
    eyePivot.add(b);
  }

  // The cheeks are not separate pieces: the body's own surface is pushed out to where two balls would stand
  // (`shapeCheeks`). So each is truly round, its outer rim runs into the body in a soft curve without a line,
  // and the only line is the cleft where the two meet.
  const pos = body.geometry.attributes.position as THREE.BufferAttribute;
  const nor = body.geometry.attributes.normal as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);
  let shaped = false;
  /** Pushes the back of the body out into the two cheeks. For every point of the body: how far out, in its
      direction, the surface of a cheek ball lies; the farther of the two balls wins (the cleft between them
      stays sharp), and that is joined to the body with a rounded rim. `grow` 0..1 is their size, `cy` their
      height, `sx,sy,sz` squash or stretch them. `open` pulls each sideways and lowers the two towards the
      cleft, most at their middle height and not at all at their top and bottom: there they stay together,
      between them an almond-shaped valley down to the bare body. */
  const shapeCheeks = (grow: number, cy: number, sx: number, sy: number, sz: number, open: number) => {
    if (grow < 0.01) {
      if (!shaped) return;
      (pos.array as Float32Array).set(base);
      (nor.array as Float32Array).set(base); // a unit sphere: the normal is the position
      shaped = false;
      pos.needsUpdate = nor.needsUpdate = true;
      return;
    }
    const R = CHEEK.r * grow, k = CHEEK.fillet * grow;
    const out = pos.array as Float32Array;
    const moved = new Uint8Array(pos.count);
    const ccy = cy / sy, ccz = CHEEK.z / sz;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      let r = 1;
      if (z < 0.45) {
        const v = (y + 0.5 - (cy - CHEEK_Y) * 0.6) / 0.5;
        const mid = Math.max(0, 1 - v * v); // 1 at the cheeks' middle height, 0 at their top and bottom
        const cx = (CHEEK.x + open * 0.33 * mid) / sx;
        const dx = x / sx, dy = y / sy, dz = z / sz;
        const a = dx * dx + dy * dy + dz * dz;
        let far = -9;
        for (const side of [-1, 1]) {
          const b = dx * side * cx + dy * ccy + dz * ccz;
          const disc = b * b - a * (cx * cx + ccy * ccy + ccz * ccz - R * R);
          // past the ball's edge the value keeps falling, so the rim below is smooth
          far = Math.max(far, (b + (disc >= 0 ? Math.sqrt(disc) : -Math.sqrt(-disc))) / a);
        }
        const h = Math.max(k - Math.abs(far - 1), 0) / k;
        let lift = Math.max(1, far) + h * h * k * 0.25 - 1;
        // pulled apart: between them the cheeks slope down to the bare body, in a soft valley, not a cut
        if (open > 0.001) {
          const gap = 0.11 * open * mid, slope = 0.5 * open * mid + 1e-4;
          lift *= THREE.MathUtils.smoothstep(Math.abs(x), gap, gap + slope);
        }
        r = 1 + lift;
      }
      out[i * 3] = x * r; out[i * 3 + 1] = y * r; out[i * 3 + 2] = z * r;
      if (r > 1.0002) moved[i] = 1;
    }
    pos.needsUpdate = true;
    // normals: off the cheeks the body is the plain sphere and keeps its own; on them, from the four neighbours
    // in the grid (much cheaper than working out every face of the body again)
    const n = nor.array as Float32Array, row = BODY_W + 1;
    for (let i = 0; i < pos.count; i++) {
      const o = i * 3;
      if (!moved[i]) { n[o] = base[o]; n[o + 1] = base[o + 1]; n[o + 2] = base[o + 2]; continue; }
      const ix = i % row, iy = (i - ix) / row;
      if (iy === 0 || iy === BODY_H) { n[o] = 0; n[o + 1] = iy ? -1 : 1; n[o + 2] = 0; continue; } // a pole
      const l = (iy * row + (ix === 0 ? BODY_W - 1 : ix - 1)) * 3, r = (iy * row + (ix === BODY_W ? 1 : ix + 1)) * 3;
      const u = ((iy - 1) * row + ix) * 3, d = ((iy + 1) * row + ix) * 3;
      const ax = out[r] - out[l], ay = out[r + 1] - out[l + 1], az = out[r + 2] - out[l + 2];
      const bx = out[d] - out[u], by = out[d + 1] - out[u + 1], bz = out[d + 2] - out[u + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const sign = nx * out[o] + ny * out[o + 1] + nz * out[o + 2] < 0 ? -1 : 1; // outward
      nx *= sign / len; ny *= sign / len; nz *= sign / len;
      n[o] = nx; n[o + 1] = ny; n[o + 2] = nz;
    }
    nor.needsUpdate = true;
    shaped = true;
  };

  // the "x" between them, on the body, covered until the cheeks are pulled apart (the split)
  const cross = new THREE.Group();
  const ink = matte(0x161816);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.03), ink);
    bar.rotation.z = a;
    cross.add(bar);
  }
  const crossAt = new THREE.Vector3(0, CHEEK_Y - 0.02, -0.905).normalize();
  cross.position.copy(crossAt).multiplyScalar(1.01);
  cross.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), crossAt);
  cross.visible = false;
  head.add(cross);

  const shell = matte(0xffc400);
  const stripe = matte(0xffcb1f);
  stripe.side = THREE.DoubleSide;
  const hat = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.07, 96, 48, 0, Math.PI * 2, 0, Math.PI * 0.47), shell);
  dome.scale.set(1, 0.92, 1.04);
  hat.add(dome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.07, 96), shell);
  brim.scale.set(1.17, 0.8, 1.27);
  brim.position.set(0, 0.07, 0.13);
  hat.add(brim);
  for (const phi of [Math.PI / 2, Math.PI * 1.5]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 48, phi - 0.13, 0.26, 0, Math.PI * 0.47), stripe);
    c.scale.set(1, 0.92, 1.04);
    hat.add(c);
  }
  hat.position.set(0, 0.34, -0.04);
  hat.rotation.set(-0.16, 0, 0.08);
  head.add(hat);
  return { rig, head, eyePivot, eyes, hat, shapeCheeks, blush, cross };
}

/** A damped spring: moves `v` towards `to`, overshooting a little. */
class Spring {
  v = 0;
  vel = 0;
  constructor(private k = 70, private c = 11) {}
  step(to: number, dt: number) {
    this.vel += ((to - this.v) * this.k - this.vel * this.c) * dt;
    this.v += this.vel * dt;
    return this.v;
  }
}

export function Mascot({ size = 120, crop = true, free = false, title = "Polier" }: { size?: number; crop?: boolean; free?: boolean; title?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    // the free mascot gets a stage: a canvas STAGE times its box, growing up and to the left, with the box's
    // own picture unchanged in its bottom-right corner (a view offset, so nothing is scaled or distorted)
    const STAGE = free ? 3 : 1, PAD_R = free ? 16 : 0, PAD_B = free ? 10 : 0;
    const W = size * STAGE;
    renderer.setSize(W, W);
    if (free) {
      const c = renderer.domElement.style;
      c.position = "absolute"; c.right = `${-PAD_R}px`; c.bottom = `${-PAD_B}px`; c.pointerEvents = "none";
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0.25, 7);
    camera.lookAt(0, 0.25, 0);
    if (free) camera.setViewOffset(size, size, -(W - size - PAD_R), -(W - size - PAD_B), W, W);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a66, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-3, 4, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.9);
    fill.position.set(0, -3, 5);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);
    if (free) {
      root.position.set(0, -0.2, 0);
      root.scale.setScalar(1.05);
    } else if (crop) {
      root.position.set(0.42, -0.5, 0);
      root.scale.setScalar(1.3);
      root.rotation.z = -0.3;
    } else {
      root.position.set(0, -0.12, 0);
      root.scale.setScalar(0.92);
      root.rotation.z = -0.08;
    }
    const { rig, head, eyePivot, eyes, hat, shapeCheeks, blush, cross } = buildRig();
    root.add(rig);

    const calm = false as boolean;
    const yaw = new Spring(calm ? 20 : 70, calm ? 9 : 11);
    const pitch = new Spring(calm ? 20 : 70, calm ? 9 : 11);
    const roll = new Spring(40, 10);
    const lean = new Spring(60, 12);
    let eyeYaw = 0, eyePitch = 0, happy = 0;
    let blinkIn = rand(1.5, 4), blinkT = -1, blinkTwice = false;
    let glanceIn = 0, glance = { yaw: 0, pitch: 0, roll: 0 };
    let hopT = -1, bounceT = 0;
    let lastYawTarget = 0;
    // the turn-around: a three-quarter turn, not a half one, so the cheeks stand out to one side and the face
    // stays free on the other; the eyes come round to you over the shoulder
    const MOON_YAW = 2.05, MOON_EYES = -1.5, MOON_FOR = 4.6, BEAT = 10.5;
    let beat = 0, amp = 0;
    const ss = THREE.MathUtils.smootherstep;
    const bump = (x: number, a: number, b: number) => Math.sin(Math.PI * clamp((x - a) / (b - a), 0, 1));
    type V3 = [number, number, number];
    const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

    // the hands, there only for the strip: two spheres in the root's space, each pulled to its target by springs
    const glove = matte(0xffc400);
    const handGeo = new THREE.SphereGeometry(0.21, 32, 24);
    const hands = [-1, 1].map((side) => {
      const m = new THREE.Mesh(handGeo, glove);
      root.add(m);
      const rest: V3 = [side * 1.2, -0.5, 0.3];
      return { m, side, rest, sp: rest.map((v) => { const q = new Spring(130, 15); q.v = v; return q; }) };
    });

    // the strip, a pole dance. T: when each part starts (seconds)
    const T = { tease: 0.6, swing: 2.0, climb: 4.4, top: 5.2, slide: 5.5, land: 6.8, grind: 7.2, kiss: 9.7, bow: 10.9, end: 12.0 };
    const SLAPS = [T.grind + 1.0, T.grind + 1.65];
    const POLE_R = 0.075, POLE_X = -(1 + POLE_R + 0.02); // the tube stands to its left, touching
    const steel = new THREE.MeshStandardMaterial({ color: 0xa9aba6, roughness: 0.45, metalness: 0.1 });
    const pole = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(POLE_R, POLE_R, 14, 24), steel);
    tube.position.y = 6;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.07, 32), matte(0x2a2d29));
    foot.position.y = -1;
    pole.add(tube, foot);
    pole.position.x = POLE_X;
    pole.visible = false;
    root.add(pole);
    // its shadow on the floor while it is away from its corner (there the CSS one does it)
    const shadeTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(18,20,19,0.34)");
      grad.addColorStop(1, "rgba(18,20,19,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const shadeMat = new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false, opacity: 0 });
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), shadeMat);
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = -1.02;
    root.add(shade);
    // the hearts of the kiss
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, -0.5);
    heartShape.bezierCurveTo(-0.95, 0.1, -0.5, 0.8, 0, 0.3);
    heartShape.bezierCurveTo(0.5, 0.8, 0.95, 0.1, 0, -0.5);
    const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3 });
    const hearts = [0, 0.22, 0.44].map((delay, i) => {
      const m = new THREE.Mesh(heartGeo, new THREE.MeshStandardMaterial({ color: 0xff4f81, roughness: 0.6, transparent: true }));
      m.visible = false;
      root.add(m);
      return { m, delay, drift: [-0.25, 0.3, -0.05][i], size: [0.42, 0.3, 0.34][i] };
    });
    let stripT = -1, flirt = 0;
    // the split: S says when the hands take hold, pull, let go, and when it turns back
    const S = { grab: 0.75, pull: 1.45, release: 3.5, away: 3.9, end: 4.7 };
    const SPLIT_YAW = 2.9, SPLIT_EYES = -2.1, OPEN = 0.45;
    let cheekX = CHEEK.x, cheekY = CHEEK_Y; // where the right cheek's centre is now, for the hands
    let splitT = -1;
    const tmp = new THREE.Vector3();
    let moonIn = rand(18, 40), moonT = -1;

    const hop = () => {
      if (!calm && hopT < 0) hopT = 0;
    };
    const onEvent = (e: Event) => {
      const what = (e as CustomEvent).detail;
      if (what === "hop") hop();
      if (what === "excited") bounceT = 2.5;
      const free = moonT < 0 && stripT < 0 && splitT < 0;
      if (what === "moon" && !calm && free) moonT = 0;
      if (what === "strip" && !calm && free) stripT = 0;
      if (what === "split" && !calm && free) splitT = 0;
    };
    el.addEventListener("click", hop);
    window.addEventListener("polier", onEvent);

    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      const now = performance.now();
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = pointer.x - cx, dy = pointer.y - cy;
      const dist = Math.hypot(dx, dy);
      const active = pointer.at > 0 && now - pointer.at < 2500;
      const over = pointer.at > 0 && dist < r.width * 0.45;
      const near = pointer.at > 0 && dist < 220;

      // where to look
      moonIn -= dt;
      if (moonIn <= 0 && moonT < 0 && stripT < 0 && splitT < 0 && !calm && !dragging && bounceT <= 0 && hopT < 0 && !over) moonT = 0;
      if (moonT >= 0) {
        moonT += dt;
        if (moonT > MOON_FOR || dragging) { moonT = -1; moonIn = rand(30, 70); }
      }
      const mooning = moonT >= 0;
      if (stripT >= 0) {
        stripT += dt;
        if (stripT > T.end || dragging) stripT = -1;
      }
      const stripping = stripT >= 0;
      const sT = stripping ? stripT : 0;
      // on stage: 1 while the tube stands
      const stage = stripping ? ss(sT, 0, 0.5) * (1 - ss(sT, T.end - 0.8, T.end - 0.2)) : 0;
      // holding on and swaying, before the swing
      const tease = stripping ? Math.sin((sT - T.tease) * 4.4) * ss(sT, T.tease, T.tease + 0.3) * (1 - ss(sT, T.swing - 0.3, T.swing)) : 0;
      // round the tube: two turns of the swing, one more on the way down from the top
      const theta = Math.PI * 2 * (2 * ss(sT, T.swing, T.climb) + ss(sT, T.slide, T.land));
      const swing = Math.sin(Math.PI * ss(sT, T.swing, T.climb)); // 0..1..0: how hard it swings out
      // up the tube with one turn on its own axis, head over at the top, down again, upright for the landing
      const climb = 1.75 * ss(sT, T.climb, T.top) * (1 - ss(sT, T.slide, T.land));
      const spin = stripping ? Math.PI * 2 * ss(sT, T.climb + 0.05, T.top - 0.05) : 0;
      const flip = stripping ? Math.PI * (ss(sT, T.top - 0.1, T.slide) - ss(sT, T.land - 0.4, T.land + 0.05)) : 0;
      const landed = bump(sT, T.land, T.land + 0.35);
      // backed up to the tube: a slow rise and fall along it, and two slaps
      const backup = stripping && sT > T.grind && sT < T.kiss;
      const grind = stripping ? bump(sT, T.grind + 0.5, T.kiss - 0.25) : 0;
      let slap = 0, jig = 0;
      // the split
      if (splitT >= 0) {
        splitT += dt;
        if (splitT > S.end || dragging) splitT = -1;
      }
      const splitting = splitT >= 0, pT = splitting ? splitT : 0;
      const back = splitting && pT < S.away + 0.1; // its back to you
      const handsOut = splitting ? ss(pT, 0.3, 0.6) * (1 - ss(pT, S.away + 0.15, S.away + 0.5)) : 0;
      const reach = splitting ? ss(pT, S.grab, S.grab + 0.3) * (1 - ss(pT, S.release + 0.1, S.away)) : 0; // hands on the cheeks
      const grip = splitting ? ss(pT, S.grab + 0.3, S.grab + 0.5) * (1 - ss(pT, S.release, S.release + 0.1)) : 0; // fingers dug in
      const apart = splitting ? ss(pT, S.pull, S.pull + 0.4) * (1 - ss(pT, S.release, S.release + 0.12)) * (1 + 0.05 * Math.sin(pT * 9)) : 0;
      if (splitting && pT > S.release + 0.1) jig += Math.exp(-6 * (pT - S.release - 0.1)) * Math.sin(36 * (pT - S.release - 0.1)) * 1.3;

      for (const at of SLAPS) {
        const x = sT - (at - 0.13);
        if (stripping && x > 0) slap = Math.max(slap, x < 0.13 ? x / 0.13 : Math.max(0, 1 - (x - 0.13) / 0.28));
        if (stripping && sT > at) jig += Math.exp(-7 * (sT - at)) * Math.sin(40 * (sT - at));
      }
      const kiss1 = ss(sT, T.kiss + 0.2, T.kiss + 0.45), kiss2 = ss(sT, T.kiss + 0.6, T.kiss + 0.85);
      const tip = stripping ? bump(sT, T.bow + 0.2, T.bow + 0.85) : 0;
      flirt += ((stripping && sT < T.end - 0.6 ? 1 : 0) - flirt) * Math.min(1, dt * 8);

      let ty: number, tp: number, tr = 0;
      if (back) {
        ty = SPLIT_YAW; tp = -0.26 - apart * 0.06; // its back to you, the low end tipped up
      } else if (backup || mooning) {
        ty = MOON_YAW; tp = -0.2; tr = -0.12; // half away from you, the low end tipped up, the head to one side
      } else if (stripping && sT < T.swing) {
        ty = -0.5 * bump(sT, 0.05, 0.6); tp = 0.03; tr = tease * 0.2; // a look at the tube, then at you, swaying
      } else if (stripping && sT < T.kiss) {
        ty = -0.28 * swing; tp = 0.04 - 0.1 * swing; tr = -0.3 * swing; // its head towards the tube, leaning out from it (it turns with the swing, see `facing`)
      } else if (stripping) {
        ty = 0; tp = 0.02; tr = 0.1 * kiss1 * (1 - ss(sT, T.bow, T.bow + 0.3));
      } else if (dragging || bounceT > 0) {
        ty = -0.35; tp = -0.18; tr = Math.sin(t * 9) * 0.08;
      } else if (over) {
        ty = 0; tp = 0.05; // at you
      } else if (active || calm) {
        // angle to the pointer as if the screen were ~700px in front of it
        ty = clamp(Math.atan2(dx, 700), -0.8, 0.6);
        tp = clamp(Math.atan2(dy, 700), -0.22, 0.35);
        tr = clamp(-dx / 4000, -0.08, 0.08);
      } else {
        glanceIn -= dt;
        if (glanceIn <= 0) {
          const pick = Math.random();
          glance =
            pick < 0.25 ? { yaw: 0, pitch: 0.02, roll: 0 } // at you
            : pick < 0.6 ? { yaw: rand(-0.95, -0.4), pitch: rand(-0.15, 0.25), roll: rand(-0.05, 0.05) } // at the page
            : pick < 0.8 ? { yaw: rand(0.2, 0.55), pitch: rand(-0.25, 0.1), roll: 0 } // the other way
            : { yaw: rand(-0.3, 0.3), pitch: rand(-0.1, 0.1), roll: rand(0.12, 0.2) * (Math.random() < 0.5 ? -1 : 1) }; // a tilt
          glanceIn = rand(1.2, 3.4);
        }
        ty = glance.yaw; tp = glance.pitch; tr = glance.roll;
      }

      // a big change of gaze: blink with it
      if (Math.abs(ty - lastYawTarget) > 0.45 && blinkT < 0) blinkT = 0;
      lastYawTarget = ty;

      // eyes lead (fast), head follows (spring), hat lags
      const hy = yaw.step(ty, dt), hp = pitch.step(tp, dt), hr = roll.step(tr, dt);
      // how far round it is (0 front, 1 back): grows the cheeks and drives the wiggle
      // round the tube it really goes round: it faces the way it travels, so it turns once with every turn of
      // the swing, and its back (and what is on it) comes into view on the far side of each
      const around = spin - theta;
      const facing = Math.atan2(Math.sin(hy + around), Math.cos(hy + around)); // where it faces, all turning included
      const turned = THREE.MathUtils.smoothstep(Math.abs(facing), 0.8, 1.8);
      // the bounce starts once it stands in the pose and dies down before it turns back
      const bouncing = (mooning && moonT > 0.75 && moonT < MOON_FOR - 0.55) || (backup && sT > T.grind + 0.55 && sT < T.kiss - 0.3);
      amp += ((bouncing ? 1 : 0) - amp) * Math.min(1, dt * 7);
      beat = mooning || backup ? beat + dt * BEAT : 0;
      const wig = amp * Math.sin(beat); // the stroke: +1 at the top, -1 at the bottom
      const rising = amp * Math.max(0, Math.cos(beat - 0.25)); // on the way up: pulled long
      const piled = amp * Math.max(0, -Math.sin(beat - 0.2)) ** 1.6; // at the bottom: flat and wide
      const eyeTo = back && pT > 0.35 ? SPLIT_EYES : stripping && sT > T.swing && sT < T.climb && Math.abs(facing) > 1.1 ? clamp(-facing * 0.95, -1.7, 1.7) /* over the shoulder */ : (mooning && moonT > 0.35) || (backup && sT > T.grind + 0.35) ? MOON_EYES : clamp((ty - hy) * 0.6, -0.22, 0.22);
      eyeYaw += (eyeTo - eyeYaw) * Math.min(1, dt * (mooning || backup || back || turned > 0.05 ? 9 : 22));
      eyePitch += (clamp((tp - hp) * 0.6, -0.15, 0.15) - eyePitch) * Math.min(1, dt * 22);
      head.rotation.set(hp - wig * 0.035, hy + around, hr + flip);
      // both cheeks go up and down together: stretched long on the way up, piled flat and wide at the bottom
      cross.visible = apart > 0.02;
      {
        // pulled apart they stay at their height and go sideways, still together at the top and the bottom
        const a = apart * OPEN;
        cheekX = CHEEK.x + a * 0.33;
        cheekY = CHEEK_Y + wig * 0.14 - piled * 0.05;
        shapeCheeks(
          turned,
          cheekY,
          1 - rising * 0.1 + piled * 0.2 + jig * 0.12 - grip * 0.08 - apart * 0.06,
          1 + rising * 0.22 - piled * 0.26 - jig * 0.12 + grip * 0.05,
          1 - rising * 0.06 + piled * 0.14 + jig * 0.1 - grip * 0.06,
          a,
        );
      }
      blush.opacity = Math.max(turned * 0.6, flirt * 0.6);
      eyePivot.rotation.set(eyePitch, eyeYaw, 0);
      hat.rotation.set(-0.16 + clamp(-pitch.vel * 0.03, -0.08, 0.08), clamp(-yaw.vel * 0.05, -0.12, 0.12), 0.08 + clamp(yaw.vel * 0.02, -0.06, 0.06));

      // the hat during the strip: tipped by a hand at the end
      const hatX = 0, hatY = tip * 0.26, hatSpin = -tip * 0.38, hatSquash = landed;
      hat.position.set(hatX, 0.34 + hatY, -0.04);
      hat.rotation.z += hatSpin;
      hat.scale.set(1 + hatSquash * 0.06, 1 - hatSquash * 0.16, 1 + hatSquash * 0.06);

      // body: breathe, lean in when near, hop, bounce
      const l = lean.step(near && !over ? 1 : 0, dt);
      let lift = calm ? 0 : Math.sin(t * 1.6) * 0.03;
      let sx = 1 + l * 0.05, sy = 1 + l * 0.05 + (calm ? 0 : Math.sin(t * 2.1) * 0.008);
      if (hopT >= 0) {
        hopT += dt;
        if (hopT < 0.12) { const k = hopT / 0.12; sy *= 1 - 0.12 * k; sx *= 1 + 0.08 * k; }
        else if (hopT < 0.5) { const k = (hopT - 0.12) / 0.38; lift += Math.sin(k * Math.PI) * 0.5; sy *= 1 + 0.06 * Math.sin(k * Math.PI); sx *= 1 - 0.04 * Math.sin(k * Math.PI); }
        else if (hopT < 0.68) { const k = (hopT - 0.5) / 0.18; const s = Math.sin(k * Math.PI); sy *= 1 - 0.1 * s; sx *= 1 + 0.07 * s; }
        else hopT = -1;
      }
      if ((dragging || bounceT > 0) && !calm) {
        bounceT = Math.max(0, bounceT - dt);
        lift += Math.abs(Math.sin(t * 7)) * 0.18;
      }
      lift += (wig * 0.5 + 0.5) * amp * 0.05;
      lift += climb + 0.06 * Math.sin(theta * 2) * swing + grind * 0.32;
      sy *= 1 - landed * 0.14;
      sx *= 1 + landed * 0.1;
      const orbit = -POLE_X;
      rig.position.x = POLE_X + orbit * Math.cos(theta) + tease * 0.05;
      rig.position.z = orbit * Math.sin(theta);
      pole.visible = stage > 0.001;
      pole.position.y = (1 - stage) * 13;
      rig.position.y = lift;
      rig.scale.set(sx, sy, sx);
      const away = Math.min(1, Math.hypot(rig.position.x, rig.position.z) * 2 + climb);
      shade.position.set(rig.position.x, -1.02, rig.position.z);
      shade.scale.setScalar(Math.max(0.3, 1 - lift * 0.3));
      shadeMat.opacity = away;
      el.style.setProperty("--shade", (1 - away).toFixed(3));

      // hands: where each wants to be, then the springs
      const bx = rig.position.x, by = rig.position.y, bz = rig.position.z;
      const onPole = (y: number): V3 => [POLE_X - 0.06, y, 0.42]; // in front of the tube, clear of the body
      const want = hands.map((h, i): V3 => [bx + h.rest[0], by + h.rest[1] + (calm ? 0 : Math.sin(t * 1.9 + i * 2) * 0.04), bz + h.rest[2]]);
      let [L, R] = want;
      if (stripping) {
        if (sT < T.swing) {
          if (sT > 0.3) L = onPole(0.35);
          if (sT > T.tease) R = [bx + 0.98, by - 0.32, bz + 0.72]; // on the hip
        } else if (sT < T.climb) {
          L = onPole(by + 0.55);
          R = [bx + 1.5 * Math.cos(theta), by + 0.5, bz + 1.5 * Math.sin(theta)]; // flung out, away from the tube
        } else if (sT < T.slide) {
          const a = sT < T.top ? 0.24 * Math.sin(sT * 13) : 0; // hand over hand
          L = onPole(by + 0.8 + a);
          R = onPole(by + 0.4 - a);
        } else if (sT < T.grind) {
          L = onPole(by + 0.65);
          R = onPole(by - 0.65);
        } else if (sT < T.kiss) {
          L = onPole(by + 1.25);
          R = mix([-0.7, by + 0.25, 1.6], [-1.0, by - 0.42, 1.12], slap); // drawn back, then onto the cheek
        } else if (sT < T.bow) {
          R = mix(mix(R, [0.18, by - 0.3, 1.14], kiss1), [1.05, by - 0.02, 1.95], kiss2); // to the lips, then out to you
        } else if (sT > T.bow + 0.1 && sT < T.bow + 0.9) {
          L = [-0.82, by + 0.72 + tip * 0.2, 0.82]; // at the brim
        }
      }
      if (splitting) {
        // each hand on the outer back of its cheek, pressed in while it holds, moving out with it.
        // Seen from behind, the head's own right is on your left.
        head.updateMatrix();
        rig.updateMatrix();
        const hold = (side: number): V3 => {
          // on the outer back of the ball, pressed into it while holding
          const d = CHEEK.r * (1 - grip * 0.12);
          tmp.set(side * (cheekX + d * 0.72), cheekY + d * 0.1, CHEEK.z - d * 0.68).applyMatrix4(head.matrix).applyMatrix4(rig.matrix);
          return [tmp.x, tmp.y, tmp.z];
        };
        L = mix(L, hold(1), reach);
        R = mix(R, hold(-1), reach);
      }
      const shown = Math.max(stage, handsOut);
      [L, R].forEach((to, i) => {
        const h = hands[i];
        h.m.position.set(h.sp[0].step(to[0], dt), h.sp[1].step(to[1], dt), h.sp[2].step(to[2], dt));
        h.m.visible = shown > 0.001;
        h.m.scale.setScalar(Math.max(0.001, shown));
      });

      // the hearts leave the hand, rise, and fade
      for (const h of hearts) {
        const k = stripping ? (sT - (T.kiss + 0.8) - h.delay) / 1.25 : -1;
        h.m.visible = k > 0 && k < 1;
        if (!h.m.visible) continue;
        h.m.position.set(1.05 + h.drift * k + Math.sin(k * 7 + h.delay * 9) * 0.1, 0.05 + k * 2.1, 1.9);
        h.m.scale.setScalar(h.size * ss(k, 0, 0.2));
        h.m.rotation.z = Math.sin(k * 6 + h.delay * 5) * 0.25;
        (h.m.material as THREE.MeshStandardMaterial).opacity = 1 - ss(k, 0.65, 1);
      }
      el.style.setProperty("--lift", lift.toFixed(3));

      // eyes: happy squint when you are over it or it hops; blinks
      happy += ((over || hopT >= 0 ? 1 : 0) - happy) * Math.min(1, dt * 10);
      blinkIn -= dt;
      if (blinkIn <= 0 && blinkT < 0) { blinkT = 0; blinkTwice = Math.random() < 0.2; blinkIn = rand(2.2, 5.5); }
      let open = 1;
      if (blinkT >= 0) {
        blinkT += dt;
        const k = blinkT / 0.16;
        if (k < 1) open = Math.abs(1 - 2 * k) * 0.92 + 0.08;
        else if (blinkTwice) { blinkTwice = false; blinkT = 0; }
        else blinkT = -1;
      }
      const sq = 1 - happy * 0.62;
      // over the shoulder: lids half down, and one slow wink with the eye nearer to you
      const lid = 1 - Math.max(turned, flirt) * 0.42;
      const wink = stripping ? 1 - THREE.MathUtils.smoothstep(sT, T.kiss + 0.75, T.kiss + 0.9) + THREE.MathUtils.smoothstep(sT, T.kiss + 1.3, T.kiss + 1.5)
        : splitting ? 1 - THREE.MathUtils.smoothstep(pT, 2.3, 2.45) + THREE.MathUtils.smoothstep(pT, 2.9, 3.1)
        : mooning ? 1 - THREE.MathUtils.smoothstep(moonT, 2.0, 2.15) + THREE.MathUtils.smoothstep(moonT, 2.6, 2.8) : 1;
      eyes[0].scale.y = open * sq * lid * Math.max(0.08, wink);
      eyes[1].scale.y = open * sq * lid;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("click", hop);
      window.removeEventListener("polier", onEvent);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      shadeTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [size, crop, free]);

  return <div ref={host} className={`mascot${free ? " free" : ""}`} role="img" aria-label={title} title={title} style={{ width: size, height: size }} />;
}
