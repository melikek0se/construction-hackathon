/* Polier, the agent: a matte sphere with two eyes and a yellow hard hat, in real 3D (three.js).

   What it does:
   - follows the pointer with its eyes first, then its head (a spring, so the turn overshoots a little and
     settles); the hat sits on the head and lags the turn
   - when the pointer rests, it glances around on its own: at the page, at you, a tilt of the head
   - when the pointer comes close it leans in; over it, it looks at you and smiles with its eyes
   - click: it crouches, hops, lands with a squash; files dragged over the page: it bounces, excited
   - blinks at random, sometimes twice, and on big gaze shifts
   Other code can make it react: window.dispatchEvent(new CustomEvent("polier", { detail: "hop" | "excited" })).
   It moves even with "reduce motion" set: a deliberate exception for the demo (as the opening's wipes, D-029);
   set HONOUR_REDUCED_MOTION to true to make it only follow slowly and blink. */
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
  window.addEventListener("dragenter", () => (dragging = true));
  window.addEventListener("drop", () => (dragging = false));
  window.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) dragging = false;
  });
}

const HONOUR_REDUCED_MOTION = false;

const matte = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });
const clamp = THREE.MathUtils.clamp;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function buildRig() {
  const rig = new THREE.Group(); // hop and squash
  const head = new THREE.Group(); // turns
  rig.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), matte(0xf2f1ec)));

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
  return { rig, head, eyePivot, eyes, hat };
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
    renderer.setSize(size, size);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0.25, 7);
    camera.lookAt(0, 0.25, 0);
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
    const { rig, head, eyePivot, eyes, hat } = buildRig();
    root.add(rig);

    const calm = HONOUR_REDUCED_MOTION && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const yaw = new Spring(calm ? 20 : 70, calm ? 9 : 11);
    const pitch = new Spring(calm ? 20 : 70, calm ? 9 : 11);
    const roll = new Spring(40, 10);
    const lean = new Spring(60, 12);
    let eyeYaw = 0, eyePitch = 0, happy = 0;
    let blinkIn = rand(1.5, 4), blinkT = -1, blinkTwice = false;
    let glanceIn = 0, glance = { yaw: 0, pitch: 0, roll: 0 };
    let hopT = -1, bounceT = 0;
    let lastYawTarget = 0;

    const hop = () => {
      if (!calm && hopT < 0) hopT = 0;
    };
    const onEvent = (e: Event) => {
      const what = (e as CustomEvent).detail;
      if (what === "hop") hop();
      if (what === "excited") bounceT = 2.5;
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
      let ty: number, tp: number, tr = 0;
      if (dragging || bounceT > 0) {
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
      eyeYaw += (clamp((ty - hy) * 0.6, -0.22, 0.22) - eyeYaw) * Math.min(1, dt * 22);
      eyePitch += (clamp((tp - hp) * 0.6, -0.15, 0.15) - eyePitch) * Math.min(1, dt * 22);
      head.rotation.set(hp, hy, hr);
      eyePivot.rotation.set(eyePitch, eyeYaw, 0);
      hat.rotation.set(-0.16 + clamp(-pitch.vel * 0.03, -0.08, 0.08), clamp(-yaw.vel * 0.05, -0.12, 0.12), 0.08 + clamp(yaw.vel * 0.02, -0.06, 0.06));

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
      rig.position.y = lift;
      rig.scale.set(sx, sy, sx);
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
      for (const e of eyes) e.scale.y = open * sq;

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
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [size, crop, free]);

  return <div ref={host} className={`mascot${free ? " free" : ""}`} role="img" aria-label={title} title={title} style={{ width: size, height: size }} />;
}
