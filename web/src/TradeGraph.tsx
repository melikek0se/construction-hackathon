import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ProjectEdge, ProjectNode } from "./types";

const INK = 0x121413;
const PLATE_W = 6.4;
const PLATE_H = 1.6;
const GROUND = 0xecece6;

interface Placed {
  node: ProjectNode;
  position: THREE.Vector3;
}

/**
 * Where each trade stands: spread through a ball, not laid out on a sheet. Every trade pushes every
 * other away, an arrow pulls its two trades together, and a weak pull to the centre keeps trades without
 * any stated dependency on the outside of the ball instead of drifting off. Same input, same picture:
 * the start positions are fixed points on a sphere and nothing is random.
 */
function layout(nodes: ProjectNode[], edges: ProjectEdge[]): Placed[] {
  const n = nodes.length;
  const radius = 4 + Math.sqrt(n) * 1.8;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const points = nodes.map((_, i) => {
    const y = n === 1 ? 0 : 1 - (2 * i) / (n - 1);
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    return new THREE.Vector3(Math.cos(golden * i) * ring, y, Math.sin(golden * i) * ring).multiplyScalar(radius);
  });
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const links = edges.flatMap((e) => {
    const a = index.get(e.source);
    const b = index.get(e.target);
    return a === undefined || b === undefined ? [] : [[a, b] as const];
  });
  const force = points.map(() => new THREE.Vector3());
  const delta = new THREE.Vector3();
  for (let step = 0; step < 320; step++) {
    force.forEach((f) => f.set(0, 0, 0));
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        delta.subVectors(points[a], points[b]);
        const d = Math.max(delta.length(), 0.5);
        delta.multiplyScalar(34 / (d * d * d)); // push apart, 34 / d² along the line between them
        force[a].add(delta);
        force[b].sub(delta);
      }
      force[a].addScaledVector(points[a], -0.09); // pull to the centre: keeps the ball a ball
    }
    for (const [a, b] of links) {
      delta.subVectors(points[b], points[a]);
      const d = Math.max(delta.length(), 0.5);
      delta.multiplyScalar((0.06 * (d - 8)) / d); // an arrow wants to be 8 long
      force[a].add(delta);
      force[b].sub(delta);
    }
    const cool = 1 - step / 320;
    points.forEach((p, i) => p.addScaledVector(force[i].clampLength(0, 1.5), cool));
  }
  return nodes.map((node, i) => ({ node, position: points[i] }));
}

function label(text: string, sub: string, fill: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 160;
  const g = canvas.getContext("2d")!;
  g.fillStyle = fill;
  g.fillRect(0, 0, 640, 160);
  g.strokeStyle = "#121413";
  g.lineWidth = 8;
  g.strokeRect(4, 4, 632, 152);
  g.fillStyle = color;
  g.font = '700 58px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textBaseline = "middle";
  let shown = text;
  while (g.measureText(shown).width > 600 && shown.length > 4) shown = shown.slice(0, -2);
  g.fillText(shown === text ? text : `${shown}…`, 22, 58);
  g.font = '600 36px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText(sub, 22, 122);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(PLATE_W, PLATE_H, 1);
  sprite.renderOrder = 2;
  return sprite;
}

/** What an arrow stands for, in the LV's words: "Vorleistung (baus.): Betondecke" -> "Betondecke". */
function edgeText(edge: ProjectEdge): string {
  const quote = edge.examples[0]?.quote ?? "";
  const what = quote.replace(/^(Vorleistung|Folgeleistung)\s*(\(baus\.\))?\s*:\s*/i, "").trim();
  const short = what.length > 30 ? `${what.slice(0, 29)}…` : what;
  return edge.count > 1 ? `${short}  ×${edge.count}` : short;
}

/** A small yellow tag that sits on an arrow. */
function tag(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d")!;
  const font = '600 40px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.font = font;
  canvas.width = Math.ceil(g.measureText(text).width) + 36;
  canvas.height = 64;
  g.fillStyle = "#ffc400";
  g.fillRect(0, 0, canvas.width, 64);
  g.fillStyle = "#121413";
  g.font = font;
  g.textBaseline = "middle";
  g.fillText(text, 18, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // sizeAttenuation off: a tag keeps its size on screen however far the camera is, so it stays readable
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false }));
  sprite.userData.aspect = canvas.width / 64;
  sprite.renderOrder = 3;
  return sprite;
}

/**
 * The trades of a project as a ball of plates: one plate per LV, an arrow from the trade that comes
 * first to the trade that builds on it, named after the work that links them. Drag to turn, scroll to
 * zoom, click a plate to read it.
 */
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
    // a narrow lens: plates at the back of the ball stay nearly as large as those in front
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 12;
    controls.maxDistance = 400;

    const placed = layout(props.nodes, props.edges);
    const at = new Map(placed.map((p) => [p.node.id, p]));
    const linked = new Set(props.edges.flatMap((e) => [e.source, e.target]));
    const plates = new Map<string, THREE.Sprite>();
    const arrows: { edge: ProjectEdge; group: THREE.Group; name: THREE.Sprite }[] = [];
    const disposables: { dispose: () => void }[] = [];

    const build = () => {
      for (const { node, position } of placed) {
        const gap = node.gaps > 0;
        const plate = label(
          node.name,
          `${node.items} items${gap ? ` · ${node.gaps} open interface${node.gaps > 1 ? "s" : ""}` : ""}`,
          gap ? "#c4161c" : linked.has(node.id) ? "#fcfcf9" : "#dcded6",
          gap ? "#ffffff" : "#121413",
        );
        plate.position.copy(position);
        plate.userData.id = node.id;
        scene.add(plate);
        plates.set(node.id, plate);
        disposables.push(plate.material.map!, plate.material);
      }
      for (const edge of props.edges) {
        const a = at.get(edge.source);
        const b = at.get(edge.target);
        if (!a || !b) continue;
        // plates always face the camera, so an arrow runs from centre to centre and stops short of both
        const whole = b.position.clone().sub(a.position);
        const gap = Math.min(2.2, whole.length() * 0.3);
        const from = a.position.clone().addScaledVector(whole.clone().normalize(), gap);
        const to = b.position.clone().addScaledVector(whole.clone().normalize(), -gap);
        const dir = to.clone().sub(from);
        const length = dir.length();
        const material = new THREE.MeshBasicMaterial({ color: INK });
        const radius = 0.035 + 0.03 * Math.sqrt(edge.count);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(length - 0.7, 0.1), 8), material);
        shaft.position.copy(from.clone().add(dir.clone().multiplyScalar((length - 0.7) / (2 * length))));
        const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 3.2, 0.7, 12), material);
        head.position.copy(to.clone().sub(dir.clone().normalize().multiplyScalar(0.35)));
        const up = new THREE.Vector3(0, 1, 0);
        const turn = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
        shaft.quaternion.copy(turn);
        head.quaternion.copy(turn);
        const group = new THREE.Group();
        group.add(shaft, head);
        // what the arrow means, a third of the way along so tags of arrows into one trade do not pile up
        const name = tag(edgeText(edge));
        name.position.copy(from.clone().add(dir.clone().multiplyScalar(0.45)));
        group.add(name);
        scene.add(group);
        arrows.push({ edge, group, name });
        disposables.push(shaft.geometry, head.geometry, material, name.material.map!, name.material);
      }
    };

    const ball = new THREE.Sphere();
    ball.setFromPoints(placed.map((p) => p.position));
    controls.target.copy(ball.center);
    // The ball is read by turning it. It turns slowly by itself until someone takes hold of it.
    controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 0.6;
    controls.addEventListener("start", () => (controls.autoRotate = false));

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      if (!camera.userData.placed) {
        // far enough for the whole ball plus half a plate, in the narrower direction of the view
        const half = Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect);
        const distance = ((ball.radius + PLATE_W / 2) / Math.sin(Math.atan(half))) * 1.3;
        camera.position.set(ball.center.x, ball.center.y + distance * 0.18, ball.center.z + distance);
        camera.userData.placed = true;
      }
      camera.updateProjectionMatrix();
    };

    let chosen: string | null = null;
    let hovered: string | null = null;
    const paint = () => {
      const focus = hovered ?? chosen;
      const near = new Set<string>(focus ? [focus] : []);
      for (const { edge } of arrows) {
        if (edge.source === focus) near.add(edge.target);
        if (edge.target === focus) near.add(edge.source);
      }
      for (const [id, plate] of plates) {
        plate.material.opacity = !focus || near.has(id) ? 1 : 0.22;
        plate.material.transparent = true;
        plate.renderOrder = focus && near.has(id) ? 4 : 2; // the picked trades stay in front of the arrow tags
        const s = id === chosen ? 1.15 : 1;
        plate.scale.set(PLATE_W * s, PLATE_H * s, 1);
      }
      for (const { edge, group, name } of arrows) {
        // with a trade in focus only its own arrows stay: what it builds on and what builds on it
        group.visible = !focus || edge.source === focus || edge.target === focus;
        // In the overview only the arrows that several items stand behind are named, or the tags would
        // cover each other; with a trade picked every one of its arrows is named, and larger.
        name.visible = focus ? true : edge.count >= 3;
        const h = focus ? 0.017 : 0.012;
        name.scale.set(h * (name.userData.aspect as number), h, 1);
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
      const found = ray.intersectObjects([...plates.values()], false)[0];
      return found ? (found.object.userData.id as string) : null;
    };
    let down: [number, number] | null = null;
    const onMove = (e: PointerEvent) => {
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
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    let frame = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(resize);
    // the plate texts are drawn on a canvas: wait for the condensed face, or they come out in Arial
    void document.fonts.load('700 58px "Barlow Condensed"').finally(() => {
      if (!alive) return;
      build();
      resize();
      chosen = selected.current; // the scene may be rebuilt while a trade is picked
      paint();
      observer.observe(el);
      tick();
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

  return <div className="trade-graph" ref={host} role="img" aria-label="Dependencies between the trade LVs" />;
}
