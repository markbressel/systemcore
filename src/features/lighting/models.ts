// The two lighting scenes, built from the shared Kit (1 unit ≈ 1 cm).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Kit, View } from "./stage";

/** Part id → device kinds (as reported by the backend) that drive it. */
export const PC_PARTS: Record<string, string[]> = {
  motherboard: ["motherboard"],
  cooler: ["cooler"],
  ram: ["ram"],
  gpu: ["gpu"],
  fans: ["case", "fan"],
  strip: ["strip"],
};
export const PERIPHERAL_PARTS: Record<string, string[]> = {
  keyboard: ["keyboard"],
  mouse: ["mouse"],
  headset: ["headset"],
  mousepad: ["mousepad"],
};
export const PART_LABELS: Record<string, string> = {
  motherboard: "Motherboard",
  cooler: "CPU cooler",
  ram: "Memory",
  gpu: "Graphics card",
  fans: "Case fans",
  strip: "LED strip",
  keyboard: "Keyboard",
  mouse: "Mouse",
  headset: "Headset",
  mousepad: "Mouse pad",
};

/** Mid-tower with a glass side and front, AIO cooler, two DIMMs, GPU and six ARGB fans. */
export function buildPc(k: Kit): View {
  const { m } = k;
  // Case shell: solid right side, top, bottom and back; glass left side and front.
  k.box([0.6, 46, 45], [10.2, 23, 0], m.chassis);
  k.box([21, 0.6, 45], [0, 45.7, 0], m.chassis);
  k.box([21, 0.6, 45], [0, 0.3, 0], m.chassis);
  k.box([21, 46, 0.6], [0, 23, -22.2], m.chassis);
  // The glass side is the removable panel (own material so it can fade out).
  const side = k.box([0.4, 45, 44], [-10.3, 23, 0], m.glass.clone(), undefined, 0);
  k.box([21, 45, 0.4], [0, 23, 22.3], m.glass, undefined, 0);
  for (const z of [22.1, -22.1]) k.box([0.8, 46, 0.8], [-10.1, 23, z], m.chassis);
  for (const z of [22.1, -22.1]) k.box([20.4, 0.8, 0.8], [-0.2, 45.6, z], m.chassis);
  for (const [x, z] of [[-7, 18], [7, 18], [-7, -18], [7, -18]]) k.box([3, 1, 4], [x, -0.5, z], m.rubber);
  // Work lamp inside the case so the parts read even with every LED off.
  const lamp = new THREE.PointLight(0xe6edf5, 260, 70, 2);
  lamp.position.set(-6, 34, 4);
  k.scene.add(lamp);
  // PSU shroud.
  k.box([19.8, 9, 35.9], [0, 5.1, -3.95], m.chassis, undefined, 0.3);

  const strip = k.part("strip");
  k.glow(new THREE.BoxGeometry(0.25, 0.25, 35), [-9.75, 9.7, -3.95], strip);
  k.glow(new THREE.BoxGeometry(0.25, 34, 0.25), [-9.55, 27, 21.6], strip);

  const mb = k.part("motherboard");
  k.box([0.3, 30.5, 24.4], [9.6, 26.5, -9.5], m.pcb, mb, 0.1);
  k.box([2.5, 13, 3.5], [8.2, 34.5, -19.5], m.chassis, mb, 0.4);
  k.glow(new THREE.BoxGeometry(0.2, 12, 0.2), [6.9, 34.5, -17.7], mb);
  k.box([2, 3, 10], [8.4, 40, -11], m.heatsink, mb, 0.3);
  k.box([1.2, 5, 5], [8.9, 15.5, -4], m.heatsink, mb, 0.3);
  k.glow(new THREE.BoxGeometry(0.15, 0.2, 5), [8.25, 18.1, -4], mb);
  for (const y of [21.6, 14]) k.box([0.8, 0.8, 9], [9.1, y, -12], m.rubber, mb, 0.1);

  const cooler = k.part("cooler");
  const pump = k.mesh(new THREE.CylinderGeometry(3.2, 3.2, 2.6, 48), [7.9, 33, -10], m.plastic, cooler);
  pump.rotation.z = Math.PI / 2;
  for (const r of [3.1, 1.6]) {
    const ring = k.glow(new THREE.TorusGeometry(r, 0.14, 10, 64), [6.55, 33, -10], cooler);
    ring.rotation.y = Math.PI / 2;
  }
  for (const dy of [-1.2, 1.2]) {
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(6.8, 34 + dy, -8), new THREE.Vector3(2, 40 + dy, -2), new THREE.Vector3(1, 41 + dy, 10), new THREE.Vector3(3, 40 + dy, 16.5)]);
    k.mesh(new THREE.TubeGeometry(path, 40, 0.55, 12), [0, 0, 0], m.rubber, cooler);
  }

  const ram = k.part("ram");
  for (const [i, z] of [-3.6, -2.6, -1.6, -0.6].entries()) {
    k.box([0.6, 14, 0.9], [9.2, 32, z], m.rubber, ram, 0.05);
    if (i % 2 === 1) {
      k.box([3.0, 13.3, 0.7], [7.6, 32, z], m.heatsink, ram, 0.15);
      k.glow(new RoundedBoxGeometry(0.6, 12.8, 0.6, 2, 0.2), [5.9, 32, z], ram);
    }
  }

  const gpu = k.part("gpu");
  k.box([12, 5, 28], [3.3, 21, -7], m.plastic, gpu, 0.6);
  k.box([12, 0.3, 27], [3.3, 23.65, -7], m.heatsink, gpu, 0.1);
  k.glow(new RoundedBoxGeometry(0.2, 0.9, 24, 2, 0.08), [-2.75, 21.8, -7], gpu);
  for (const z of [-17, -7, 3]) {
    const f = k.fan(8.5, gpu);
    f.position.set(3.3, 18.3, z);
    f.rotation.x = Math.PI / 2;
  }

  const fans = k.part("fans");
  k.box([12.4, 37, 2.8], [0, 26.8, 17.6], m.heatsink, undefined, 0.2);
  for (const y of [14.5, 26.8, 39.1]) k.fan(12, fans).position.set(0, y, 20.4);
  const rear = k.fan(12, fans);
  rear.position.set(-1, 37, -20.7);
  rear.rotation.y = Math.PI;
  for (const z of [-12, 0]) {
    const f = k.fan(12, fans);
    f.position.set(-1, 44.1, z);
    f.rotation.x = -Math.PI / 2;
  }

  return {
    camera: [-78, 40, 60],
    target: [0, 23, 0],
    minDistance: 45,
    maxDistance: 180,
    // Panel slides off to the back-left; lifted parts float in front of the open side.
    // Hotspots on the visible face of each part, spread so labels do not overlap.
    anchors: { motherboard: [8.5, 16, -17], cooler: [6.4, 33, -10], ram: [5.8, 39.5, -1.6], gpu: [-2.8, 21.8, -13], fans: [-3, 39, 21], strip: [-9.7, 9.8, 8] },
    lift: { panel: { mesh: side, off: [-30, 23, -38] }, showcase: [-34, 26, 8], look: [-1, 0.35, 0.45], restCamera: [-92, 40, 30] },
  };
}

/** Desk: TKL keyboard, gaming mouse, headset on a stand, RGB mouse pad. */
export function buildPeripherals(k: Kit): View {
  const { m } = k;

  const pad = k.part("mousepad");
  k.box([80, 0.4, 32], [0, 0.2, 0], m.rubber, pad, 0.15);
  for (const z of [-16.1, 16.1]) k.glow(new THREE.BoxGeometry(80.4, 0.3, 0.3), [0, 0.25, z], pad);
  for (const x of [-40.1, 40.1]) k.glow(new THREE.BoxGeometry(0.3, 0.3, 32.4), [x, 0.25, 0], pad);

  const kb = k.part("keyboard");
  kb.position.set(-14, 0.4, 1);
  kb.rotation.x = 0.06;
  k.box([36.5, 2.2, 13.4], [0, 1.1, 0], m.chassis, kb, 0.8);
  k.glow(new THREE.BoxGeometry(35.6, 0.2, 12.6), [0, 2.25, 0], kb);
  // TKL layout in key units: [x, row, width]. Rows: 0 = F row, 1..5 = main rows.
  const keys: [number, number, number][] = [];
  const row = (r: number, widths: number[], start = 0) => widths.reduce((x, w) => (w > 0 && keys.push([x, r, w]), x + Math.abs(w)), start);
  row(0, [1, -1, 1, 1, 1, 1, -0.5, 1, 1, 1, 1, -0.5, 1, 1, 1, 1]);
  row(1, [...Array(13).fill(1), 2]);
  row(2, [1.5, ...Array(12).fill(1), 1.5]);
  row(3, [1.75, ...Array(11).fill(1), 2.25]);
  row(4, [2.25, ...Array(10).fill(1), 2.75]);
  row(5, [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25]);
  for (const r of [0, 1, 2]) row(r, [1, 1, 1], 15.25);
  row(4, [1], 16.25);
  row(5, [1, 1, 1], 15.25);
  const u = 1.905;
  const caps = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 0.9, 1, 2, 0.12), m.keycap, keys.length);
  const t = new THREE.Matrix4();
  keys.forEach(([x, r, w], i) => {
    const z = r === 0 ? -5.6 : -5.6 + 0.4 * u + r * u;
    t.compose(new THREE.Vector3(-17.4 + (x + w / 2) * u, 2.75, z), new THREE.Quaternion(), new THREE.Vector3(w * u - 0.28, 1, u - 0.28));
    caps.setMatrixAt(i, t);
  });
  kb.add(caps);

  const mouse = k.part("mouse");
  mouse.position.set(17, 0.4, 3);
  mouse.rotation.y = -0.12;
  k.box([6.2, 0.6, 12.6], [0, 0.3, 0], m.rubber, mouse, 0.28);
  const shell = k.mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.5, 0.4], m.plastic, mouse);
  shell.scale.set(3.1, 3.4, 6.3);
  const wheel = k.mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.6, 24), [0, 3.35, -3], m.chrome, mouse);
  wheel.rotation.z = Math.PI / 2;
  k.box([0.08, 0.6, 4], [0, 3.4, -3.6], m.rubber, mouse, 0);
  const logo = k.glow(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 32), [0, 3.88, 1.6], mouse);
  logo.rotation.x = 0.12;
  for (let i = 0; i < 3; i++) k.glow(new RoundedBoxGeometry(0.2, 0.14, 0.45, 1, 0.05), [-1.75, 2.85, -2.4 + i * 0.6], mouse);
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1, -6.2), new THREE.Vector3(0, 1.5, -10), new THREE.Vector3(-3, 0.6, -16), new THREE.Vector3(-4, 0.5, -26)]);
  k.mesh(new THREE.TubeGeometry(cable, 40, 0.2, 8), [0, 0, 0], m.rubber, mouse);

  // Headset on its stand (the stand itself is not a lit part).
  k.mesh(new THREE.CylinderGeometry(5, 5.4, 0.8, 48), [33, 0.4, -6], m.chassis);
  k.mesh(new THREE.CylinderGeometry(0.6, 0.6, 22, 24), [33, 11.5, -6], m.heatsink);
  k.box([2.4, 1.2, 4], [33, 22.6, -6], m.chassis, undefined, 0.5);
  const hs = k.part("headset");
  hs.position.set(33, 15, -6);
  const band = k.mesh(new THREE.TorusGeometry(8.4, 0.9, 16, 64, Math.PI), [0, 0, 0], m.plastic, hs);
  band.scale.set(1, 1, 1.5);
  for (const s of [-1, 1]) {
    k.mesh(new THREE.BoxGeometry(0.8, 4, 1.4), [s * 8.4, -1.5, 0], m.heatsink, hs);
    const cup = k.mesh(new THREE.CylinderGeometry(4.2, 4.2, 3, 48), [s * 8.7, -5.8, 0], m.plastic, hs);
    cup.rotation.z = Math.PI / 2;
    const cushion = k.mesh(new THREE.TorusGeometry(3.4, 1, 16, 48), [s * 6.9, -5.8, 0], m.rubber, hs);
    cushion.rotation.y = Math.PI / 2;
    const ring = k.glow(new THREE.TorusGeometry(3, 0.2, 10, 64), [s * 10.25, -5.8, 0], hs);
    ring.rotation.y = Math.PI / 2;
  }

  return {
    camera: [-10, 48, 72],
    target: [6, 4, 0],
    minDistance: 30,
    maxDistance: 170,
    // Picked-up devices float above the front of the desk, facing the viewer.
    anchors: { keyboard: [-14, 4, -2], mouse: [17, 5, 3], headset: [33, 24.5, -6], mousepad: [-34, 0.6, 14] },
    lift: { showcase: [4, 16, 26], look: [0, 0.5, 1], restCamera: [-10, 48, 72] },
  };
}
