import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ProjectEdge, ProjectNode } from "./types";

/* The trades of a project as a structure going up: one slab per LV, stacked in the order of work.
   A trade stands one storey above the last trade it builds on, so "first this, then that" reads from
   the ground upward. Trades without any stated interface wait as a pile beside the structure. */

const INK = 0x121413;
const GROUND = 0xffffff;
const YELLOW = 0xffc400;
const [W, H, D] = [8.6, 1.8, 2.2]; // one slab
const GAP_X = 1.1;
const STOREY = 4.1;
const ROW = 3.7; // a second row of a storey stands this far behind the first
const PER_ROW = 4;
const DIM = 0.14;
const YARD = D / 2 + 1.5 + 4.4; // first row of the trades laid out in front

const STATE = {
  gap: { face: "#c4161c", text: "#ffffff", side: 0x8e0d12 },
  linked: { face: "#ffffff", text: "#121413", side: 0xe3e3dd },
  loose: { face: "#f6f6f2", text: "#5f635c", side: 0xc4c4bc },
};

interface Placed {
  node: ProjectNode;
  storey: number; // -1 = in the pile beside the structure
  position: THREE.Vector3;
}

/** Storey of each trade: one above the highest trade it builds on. Arrows that close a loop are ignored. */
function storeys(nodes: ProjectNode[], edges: ProjectEdge[]): Map<string, number> {
  const before = new Map<string, string[]>();
  for (const e of edges) before.set(e.target, [...(before.get(e.target) ?? []), e.source]);
  const level = new Map<string, number>();
  const open = new Set<string>();
  const visit = (id: string): number => {
    const known = level.get(id);
    if (known !== undefined) return known;
    if (open.has(id)) return -1; // a loop: this arrow does not lift anything
    open.add(id);
    const own = Math.max(-1, ...(before.get(id) ?? []).map(visit)) + 1;
    open.delete(id);
    level.set(id, own);
    return own;
  };
  nodes.forEach((n) => visit(n.id));
  return level;
}

function layout(nodes: ProjectNode[], edges: ProjectEdge[]): Placed[] {
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  const level = storeys(nodes, edges);
  const floors: ProjectNode[][] = [];
  const loose: ProjectNode[] = [];
  for (const node of nodes) {
    // with no arrow at all there is no structure to stand beside: every trade goes on the ground storey
    if (!linked.has(node.id) && edges.length > 0) loose.push(node);
    else (floors[level.get(node.id) ?? 0] ??= []).push(node);
  }
  const placed: Placed[] = [];
  const xOf = new Map<string, number>();
  floors.forEach((floor, storey) => {
    // a trade stands near the trades it builds on, so arrows cross as little as possible
    const pull = (n: ProjectNode) => {
      const xs = edges.filter((e) => e.target === n.id && xOf.has(e.source)).map((e) => xOf.get(e.source)!);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    };
    const ordered = storey === 0 ? floor : [...floor].sort((a, b) => pull(a) - pull(b));
    ordered.forEach((node, i) => {
      const row = Math.floor(i / PER_ROW);
      const inRow = Math.min(PER_ROW, ordered.length - row * PER_ROW);
      const x = ((i % PER_ROW) - (inRow - 1) / 2) * (W + GAP_X);
      xOf.set(node.id, x);
      placed.push({ node, storey, position: new THREE.Vector3(x, storey * STOREY + H / 2, -row * ROW) });
    });
  });
  // trades nobody refers to are laid out on the ground in front of the structure, where they hide nothing
  loose.forEach((node, i) => {
    const row = Math.floor(i / PER_ROW);
    const inRow = Math.min(PER_ROW, loose.length - row * PER_ROW);
    const x = ((i % PER_ROW) - (inRow - 1) / 2) * (W + GAP_X);
    placed.push({ node, storey: -1, position: new THREE.Vector3(x, H / 2 - 0.7, YARD + row * ROW) });
  });
  return placed;
}

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** The lettered front of a slab: the trade's name and what it carries. */
function face(text: string, sub: string, fill: string, color: string): THREE.CanvasTexture {
  const [w, h] = [1032, 204];
  return canvasTexture(w, h, (g) => {
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#121413";
    g.lineWidth = 12;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = color;
    g.textBaseline = "middle";
    g.font = '700 84px "Barlow Condensed", "Arial Narrow", sans-serif';
    let shown = text;
    while (g.measureText(shown).width > w - 60 && shown.length > 4) shown = shown.slice(0, -2);
    g.fillText(shown === text ? text : `${shown}…`, 30, 78);
    g.font = '600 50px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText(sub.toUpperCase(), 30, 158);
  });
}

function hazard(): THREE.CanvasTexture {
  const texture = canvasTexture(256, 64, (g) => {
    g.fillStyle = "#ffc400";
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = "#121413";
    for (let x = -64; x < 320; x += 64) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 32, 64);
      g.lineTo(x + 96, 0);
      g.lineTo(x + 64, 0);
      g.fill();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** A caption that always faces the viewer and keeps its size on screen. */
function caption(text: string, fill: string | null, color: string, size = 44): THREE.Sprite {
  const font = `600 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const width = Math.ceil(probe.measureText(text).width) + 40;
  const height = Math.round(size * 1.6);
  const texture = canvasTexture(width, height, (g) => {
    if (fill) {
      g.fillStyle = fill;
      g.fillRect(0, 0, width, height);
    }
    g.fillStyle = color;
    g.font = font;
    g.textBaseline = "middle";
    g.fillText(text, 20, height / 2 + 2);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false }));
  sprite.userData.aspect = width / height;
  sprite.renderOrder = 5;
  return sprite;
}

/** What an arrow stands for, in the LV's words: "Vorleistung (baus.): Betondecke" -> "Betondecke". */
function edgeText(edge: ProjectEdge): string {
  const quote = edge.examples[0]?.quote ?? "";
  const what = quote.replace(/^(Vorleistung|Folgeleistung)\s*(\(baus\.\))?\s*:\s*/i, "").trim();
  const short = what.length > 30 ? `${what.slice(0, 29)}…` : what;
  return edge.count > 1 ? `${short}  ×${edge.count}` : short;
}

export function TradeGraph(props: {
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ highlight: (id: string | null) => void } | null>(null);
  const onSelect = useRef(props.onSelect);
  onSelect.current = props.onSelect;
  const selected = useRef(props.selected);
  selected.current = props.selected;

  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(GROUND);
    scene.add(new THREE.AmbientLight(0xffffff, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 14, 9);
    scene.add(sun);
    // a narrow lens: slabs at the back stay nearly as large as those in front
    const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    // the slabs are lettered on their front: the view turns, but never far enough to lose the lettering
    controls.minAzimuthAngle = -1.0;
    controls.maxAzimuthAngle = 1.0;
    controls.minPolarAngle = 0.75;
    controls.maxPolarAngle = 1.52;

    const placed = layout(props.nodes, props.edges);
    const at = new Map(placed.map((p) => [p.node.id, p]));
    const slabs = new Map<string, { mesh: THREE.Mesh; top: THREE.MeshLambertMaterial; rest: THREE.Material[]; home: number }>();
    const arrows: { edge: ProjectEdge; group: THREE.Group; name: THREE.Sprite; ink: THREE.MeshBasicMaterial }[] = [];
    const captions: THREE.Sprite[] = [];
    const disposables: { dispose: () => void }[] = [];
    const slabGeometry = new THREE.BoxGeometry(W, H, D);
    const outline = new THREE.EdgesGeometry(slabGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: INK, transparent: true });
    disposables.push(slabGeometry, outline, lineMaterial);
    const bounds = new THREE.Box3();

    const build = () => {
      for (const { node, position, storey } of placed) {
        const state = node.gaps > 0 ? STATE.gap : storey < 0 ? STATE.loose : STATE.linked;
        const sub = `${node.items} items${node.gaps > 0 ? ` · ${node.gaps} open interface${node.gaps > 1 ? "s" : ""}` : ""}`;
        const side = new THREE.MeshLambertMaterial({ color: state.side, transparent: true });
        const top = new THREE.MeshLambertMaterial({ color: state.side, transparent: true });
        const front = new THREE.MeshBasicMaterial({ map: face(node.name, sub, state.face, state.text), transparent: true });
        const mesh = new THREE.Mesh(slabGeometry, [side, side, top, side, front, side]); // +x -x +y -y +z -z
        mesh.position.copy(position);
        mesh.userData.id = node.id;
        const edges = new THREE.LineSegments(outline, lineMaterial);
        edges.raycast = () => undefined;
        mesh.add(edges);
        scene.add(mesh);
        slabs.set(node.id, { mesh, top, rest: [side, front], home: position.y });
        disposables.push(side, top, front.map!, front);
        bounds.expandByObject(mesh);
        mesh.userData.delay = Math.max(0, storey) * 130 + (storey < 0 ? 500 : 0);
        mesh.visible = false;
      }

      // the slab everything stands on, with site tape along its front
      const structure = placed.filter((p) => p.storey >= 0);
      const [x0, x1] = [Math.min(...structure.map((p) => p.position.x)) - W / 2 - 1.5, Math.max(...structure.map((p) => p.position.x)) + W / 2 + 1.5];
      const z0 = Math.min(...structure.map((p) => p.position.z)) - D / 2 - 1.5;
      const tape = hazard();
      tape.repeat.set((x1 - x0) / 4, 1);
      const concrete = new THREE.MeshLambertMaterial({ color: 0xc4c4bc });
      const stripe = new THREE.MeshBasicMaterial({ map: tape });
      const base = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.7, D / 2 + 1.5 - z0), [concrete, concrete, concrete, concrete, stripe, concrete]);
      base.position.set((x0 + x1) / 2, -0.35, (D / 2 + 1.5 + z0) / 2);
      scene.add(base);
      disposables.push(base.geometry, concrete, tape, stripe);
      bounds.expandByObject(base);
      bounds.min.x -= 9; // room for the captions that stand left of the structure

      // which way is "later"
      const top = Math.max(...structure.map((p) => p.position.y));
      const first = caption("BUILT FIRST", null, "#121413");
      first.position.set(x0 - 0.6, H / 2, D / 2);
      first.center.set(1, 0.5);
      const later = caption("BUILT LATER", null, "#121413");
      later.position.set(x0 - 0.6, top, D / 2);
      later.center.set(1, 0.5);
      captions.push(first, later);
      const pile = placed.filter((p) => p.storey < 0);
      if (pile.length) {
        const note = caption("NO STATED INTERFACE", null, "#5f635c");
        note.position.set(Math.min(...pile.map((p) => p.position.x)) - W / 2 - 0.6, pile[0].position.y, YARD);
        note.center.set(1, 0.5);
        captions.push(note);
      }
      captions.forEach((c) => {
        scene.add(c);
        disposables.push(c.material.map!, c.material);
      });

      for (const edge of props.edges) {
        const a = at.get(edge.source);
        const b = at.get(edge.target);
        if (!a || !b) continue;
        // from the top front edge of the earlier trade to the bottom front edge of the later one,
        // bowed toward the viewer so it runs in front of the slabs in between
        const rise = b.position.y >= a.position.y;
        const from = a.position.clone().add(new THREE.Vector3(0, rise ? H / 2 : -H / 2, D / 2));
        const to = b.position.clone().add(new THREE.Vector3(0, rise ? -H / 2 : H / 2, D / 2));
        const bow = 1.2 + 0.25 * Math.abs(b.storey - a.storey);
        const curve = new THREE.CubicBezierCurve3(
          from,
          from.clone().add(new THREE.Vector3(0, rise ? 1.2 : -1.2, bow)),
          to.clone().add(new THREE.Vector3(0, rise ? -1.6 : 1.6, bow)),
          to,
        );
        const radius = 0.045 + 0.03 * Math.sqrt(edge.count);
        const ink = new THREE.MeshBasicMaterial({ color: INK, transparent: true });
        const shaft = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, radius, 8), ink);
        const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 3.4, 0.85, 14), ink);
        const tangent = curve.getTangent(1).normalize();
        head.position.copy(to.clone().addScaledVector(tangent, -0.42));
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        const group = new THREE.Group();
        group.add(shaft, head);
        const name = caption(edgeText(edge), "#ffc400", "#121413", 40);
        name.position.copy(curve.getPoint(0.5));
        group.add(name);
        group.visible = false;
        scene.add(group);
        arrows.push({ edge, group, name, ink });
        disposables.push(shaft.geometry, head.geometry, ink, name.material.map!, name.material);
      }
    };

    const lens = 2 * Math.tan((camera.fov * Math.PI) / 360); // view height at distance 1
    let held = false; // once someone has turned the view, a resize no longer re-frames it
    controls.addEventListener("start", () => (held = true));

    const frameAll = () => {
      // Stand exactly far enough that every corner of the structure is inside the view from this side.
      const centre = bounds.getCenter(new THREE.Vector3());
      const from = new THREE.Vector3(0.3, 0.27, 1).normalize();
      const right = new THREE.Vector3(0, 1, 0).cross(from).normalize();
      const up = from.clone().cross(right);
      const vertical = Math.tan((camera.fov * Math.PI) / 360);
      const horizontal = vertical * camera.aspect;
      let distance = 1;
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const c = new THREE.Vector3(x, y, z).sub(centre);
            distance = Math.max(distance, c.dot(from) + Math.max(Math.abs(c.dot(right)) / horizontal, Math.abs(c.dot(up)) / vertical));
          }
        }
      }
      distance *= 1.06;
      controls.target.copy(centre);
      camera.position.copy(centre).addScaledVector(from, distance);
      controls.minDistance = distance * 0.35;
      controls.maxDistance = distance * 1.6;
    };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      if (!held) frameAll();
      const px = (26 / Math.max(h, 1)) * lens; // captions are sized in screen pixels
      for (const c of captions) c.scale.set(px * (c.userData.aspect as number), px, 1);
    };

    let chosen: string | null = null;
    let hovered: string | null = null;
    let ready = false;
    const paint = () => {
      const focus = hovered ?? chosen;
      const near = new Set<string>(focus ? [focus] : []);
      for (const { edge } of arrows) {
        if (edge.source === focus) near.add(edge.target);
        if (edge.target === focus) near.add(edge.source);
      }
      for (const [id, slab] of slabs) {
        const on = !focus || near.has(id);
        for (const m of [slab.top, ...slab.rest]) m.opacity = on ? 1 : DIM;
        // the picked trade gets a yellow top, like a marked pallet
        const state = STATE[at.get(id)!.node.gaps > 0 ? "gap" : at.get(id)!.storey < 0 ? "loose" : "linked"];
        slab.top.color.setHex(id === chosen ? YELLOW : state.side);
        slab.mesh.renderOrder = on ? 1 : 0;
      }
      lineMaterial.opacity = focus ? 0.55 : 1;
      const h = el.clientHeight || 1;
      for (const { edge, group, name, ink } of arrows) {
        // with a trade in focus only its own arrows stay: what it builds on and what builds on it
        group.visible = ready && (!focus || edge.source === focus || edge.target === focus);
        // In the overview the arrows are a faint web behind the lettering and carry no names; with a
        // trade picked its arrows turn solid and each is named after the work that links the two trades.
        ink.opacity = focus ? 1 : 0.28;
        name.visible = focus !== null;
        const px = (30 / h) * lens;
        name.scale.set(px * (name.userData.aspect as number), px, 1);
      }
    };
    api.current = {
      highlight: (id) => {
        chosen = id;
        paint();
      },
    };

    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hit = (e: PointerEvent): string | null => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const found = ray.intersectObjects([...slabs.values()].map((s) => s.mesh), false)[0];
      return found ? (found.object.userData.id as string) : null;
    };
    let down: [number, number] | null = null;
    const onMove = (e: PointerEvent) => {
      if (down) return; // turning the view, not pointing at a trade
      const id = hit(e);
      if (id !== hovered) {
        hovered = id;
        renderer.domElement.style.cursor = id ? "pointer" : "grab";
        paint();
      }
    };
    const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
    const onUp = (e: PointerEvent) => {
      // a drag turns the view; only a click without movement selects
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) onSelect.current(hit(e));
      down = null;
    };
    const onLeave = () => {
      if (hovered) {
        hovered = null;
        paint();
      }
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    let frame = 0;
    let alive = true;
    let started = 0;
    const tick = (now: number) => {
      if (!alive) return;
      if (!ready) {
        // the structure goes up storey by storey, then the arrows are drawn
        started ||= now;
        let moving = false;
        for (const slab of slabs.values()) {
          const t = Math.min(1, Math.max(0, (now - started - (slab.mesh.userData.delay as number)) / 520));
          slab.mesh.visible = t > 0;
          slab.mesh.position.y = slab.home + (1 - (1 - (1 - t) ** 4)) * 7; // ease-out: lands, does not bounce
          moving ||= t < 1;
        }
        if (!moving) {
          ready = true;
          paint();
        }
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(resize);
    // the lettering is drawn on a canvas: wait for the condensed face, or it comes out in Arial
    void document.fonts.load('700 84px "Barlow Condensed"').finally(() => {
      if (!alive) return;
      build();
      resize();
      chosen = selected.current; // the scene may be rebuilt while a trade is picked
      paint();
      observer.observe(el);
      frame = requestAnimationFrame(tick);
    });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [props.nodes, props.edges]);

  useEffect(() => {
    api.current?.highlight(props.selected);
  }, [props.selected]);

  return (
    <div
      className="trade-graph"
      ref={host}
      role="img"
      aria-label="The trade LVs stacked in the order of work, with arrows from each trade to the trades that build on it"
    />
  );
}
