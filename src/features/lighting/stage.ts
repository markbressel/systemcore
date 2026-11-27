// Shared 3D stage for the lighting pages: renderer, studio reflections, bloom for real glow,
// orbit controls, picking and the material kit every model is built from (so they all look alike).
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type Vec3 = [number, number, number];

/** Lit part of a model: a group whose meshes are picked together; `glows` are its LED materials. */
interface Part {
  group: THREE.Group;
  glows: THREE.MeshStandardMaterial[];
  light: THREE.PointLight;
}

const UNLIT = new THREE.Color("#2c3038");
const STUDIO = "#14171c";
/** Render layer of LED surfaces: only these bloom (selective bloom), whatever their hue. */
const BLOOM = 1;

export class Kit {
  readonly parts = new Map<string, Part>();
  readonly spinners: THREE.Object3D[] = [];
  readonly m = {
    // Anodized aluminium, satin plastics and brushed heatsinks: dark but never black, so edges catch the rim light.
    chassis: new THREE.MeshStandardMaterial({ color: "#2a2e35", metalness: 0.7, roughness: 0.35 }),
    plastic: new THREE.MeshStandardMaterial({ color: "#2c3037", metalness: 0.15, roughness: 0.42 }),
    rubber: new THREE.MeshStandardMaterial({ color: "#1c1e22", metalness: 0, roughness: 0.85 }),
    pcb: new THREE.MeshStandardMaterial({ color: "#1a2330", metalness: 0.35, roughness: 0.55 }),
    heatsink: new THREE.MeshStandardMaterial({ color: "#6d7480", metalness: 0.9, roughness: 0.28 }),
    chrome: new THREE.MeshStandardMaterial({ color: "#c8ced6", metalness: 1, roughness: 0.2 }),
    keycap: new THREE.MeshStandardMaterial({ color: "#33373e", metalness: 0.05, roughness: 0.4 }),
    // Milky blades catch the ring light like real ARGB fans.
    blade: new THREE.MeshStandardMaterial({ color: "#4a505a", metalness: 0, roughness: 0.35, transparent: true, opacity: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#9fb4c8", metalness: 0, roughness: 0.04, transparent: true, opacity: 0.1, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
  };

  constructor(readonly scene: THREE.Scene) {}

  /** A lit, clickable part. Everything added to the returned group belongs to it. */
  part(id: string, parent: THREE.Object3D = this.scene) {
    const group = new THREE.Group();
    group.userData.part = id;
    parent.add(group);
    const light = new THREE.PointLight(0xffffff, 0, 22, 1.6);
    this.scene.add(light);
    this.parts.set(id, { group, glows: [], light });
    return group;
  }

  /** Rounded box; `r` is the corner radius. */
  box(size: Vec3, at: Vec3, mat: THREE.Material, parent: THREE.Object3D = this.scene, r = 0.15) {
    const radius = Math.min(r, ...size.map((s) => s / 2 - 0.001));
    const geo = radius > 0.01 ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius) : new THREE.BoxGeometry(...size);
    return this.mesh(geo, at, mat, parent);
  }

  mesh(geo: THREE.BufferGeometry, at: Vec3, mat: THREE.Material, parent: THREE.Object3D = this.scene) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  }

  /** LED surface of the part that `parent` belongs to. */
  glow(geo: THREE.BufferGeometry, at: Vec3, parent: THREE.Object3D) {
    const mat = new THREE.MeshStandardMaterial({ color: "#000000", emissive: UNLIT.clone(), roughness: 0.4 });
    let p: THREE.Object3D | null = parent;
    while (p && !p.userData.part) p = p.parent;
    if (p) this.parts.get(p.userData.part)!.glows.push(mat);
    const mesh = this.mesh(geo, at, mat, parent);
    mesh.layers.enable(BLOOM);
    return mesh;
  }

  /** ARGB fan facing +z, `size` cm square: frame, spinning milky blades, lit ring on both faces and a lit hub. */
  fan(size: number, parent: THREE.Object3D) {
    const g = new THREE.Group();
    parent.add(g);
    const frame = new THREE.Shape();
    const h = size / 2;
    frame.moveTo(-h, -h).lineTo(h, -h).lineTo(h, h).lineTo(-h, h).lineTo(-h, -h);
    const hole = new THREE.Path();
    hole.absarc(0, 0, h * 0.92, 0, Math.PI * 2, true);
    frame.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(frame, { depth: size * 0.2, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 40 });
    fg.translate(0, 0, -size * 0.1);
    this.mesh(fg, [0, 0, 0], this.m.chassis, g);
    for (const z of [-size * 0.1 - 0.05, size * 0.1 + 0.05]) {
      this.glow(new THREE.TorusGeometry(h * 0.92, size * 0.018, 10, 72), [0, 0, z], g);
    }
    const rotor = new THREE.Group();
    g.add(rotor);
    const blade = new THREE.Shape();
    blade.moveTo(0, 0).quadraticCurveTo(h * 0.45, h * 0.12, h * 0.86, h * 0.34).quadraticCurveTo(h * 0.62, -h * 0.12, 0, -h * 0.2);
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.08, bevelEnabled: false, curveSegments: 12 });
    for (let i = 0; i < 9; i++) {
      const b = this.mesh(bg, [0, 0, 0], this.m.blade, rotor);
      b.rotation.set(0, 0.35, (i / 9) * Math.PI * 2);
    }
    const hub = this.glow(new THREE.CylinderGeometry(h * 0.3, h * 0.3, size * 0.16, 36), [0, 0, 0], rotor);
    hub.rotation.x = Math.PI / 2;
    this.spinners.push(rotor);
    return g;
  }
}

export interface View {
  camera: Vec3;
  target: Vec3;
  minDistance: number;
  maxDistance: number;
  /** Where each part's guide hotspot sits (world position at home); defaults to the part's center. */
  anchors?: Record<string, Vec3>;
  /**
   * Lift mode: clicking a part lifts it to `showcase` and frames it from `look` (direction toward the camera).
   * With a `panel`, the first click takes that panel off (to `panelOff`) before parts can be lifted.
   * `restCamera` is where the camera returns once nothing is lifted.
   */
  lift?: { showcase: Vec3; look: Vec3; restCamera: Vec3; panel?: { mesh: THREE.Mesh; off: Vec3 } };
}

export interface StageEvents {
  /** Normal mode: a lit part was clicked. Lift mode: a part was lifted out, or put back (null). */
  onPick: (part: string | null) => void;
  /** Lift mode with a panel: the panel came off (true) or went back on (false). */
  onOpen?: (open: boolean) => void;
  /** Guide hotspot text per part id, plus "case" for the closed PC. */
  labels: Record<string, string>;
  /** Screen-reader suffixes for hotspots: RGB found / not found. */
  rgbText: string;
  noRgbText: string;
}

export interface Stage {
  /** Color per lit part; parts without one are drawn unlit (and, outside lift mode, cannot be picked). */
  paint(colors: Record<string, string>, selected: string | null): void;
  /** Lift mode: open the case if needed and lift this part out. */
  focus(part: string): void;
  /** Lift mode: put the lifted part back. */
  release(): void;
  /** Lift mode: put everything back (and close the case). */
  close(): void;
  dispose(): void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function createStage(host: HTMLElement, build: (k: Kit) => View, events: StageEvents): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Always a dark studio backdrop, also in the light theme: bloom would turn a light background into white haze,
  // and LEDs only read against dark.
  scene.background = new THREE.Color(STUDIO);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.fog = new THREE.Fog(STUDIO, 150, 340);
  // Studio lighting: warm key with soft shadows, low fill, strong cool rim that draws the edges.
  const key = new THREE.DirectionalLight(0xfff4e8, 1.8);
  key.position.set(-30, 60, 40);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
  fill.position.set(-60, 10, 20);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.6);
  rim.position.set(30, 40, -60);
  scene.add(key, fill, rim, new THREE.HemisphereLight(0xb0c0d0, 0x202020, 0.35));

  const kit = new Kit(scene);
  const view = build(kit);

  // Glossy studio floor under the model: soft contact shadows and reflections that fade into the fog.
  const bounds = new THREE.Box3().setFromObject(scene);
  const reach = bounds.getBoundingSphere(new THREE.Sphere()).radius * 1.3;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: "#101318", metalness: 0.45, roughness: 0.32 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = bounds.min.y - 0.02;
  scene.add(floor);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const glass = (mesh.material as THREE.Material).transparent;
    mesh.castShadow = !glass && mesh !== floor;
    mesh.receiveShadow = !glass;
  });
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 400 });
  bounds.getCenter(key.target.position);
  scene.add(key.target);
  // Each part's colored spill light sits at its center, like LEDs lighting up the inside of a case.
  // `home` remembers where every part (and its light) belongs, for lifting it out and putting it back.
  const home = new Map<string, { group: THREE.Vector3; light: THREE.Vector3; center: THREE.Vector3; radius: number }>();
  for (const [id, p] of kit.parts) {
    const box = new THREE.Box3().setFromObject(p.group);
    box.getCenter(p.light.position);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    home.set(id, { group: p.group.position.clone(), light: p.light.position.clone(), center: sphere.center.clone(), radius: sphere.radius });
  }

  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 600);
  camera.position.set(...view.camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...view.target);
  controls.enableDamping = true;
  controls.minDistance = view.minDistance;
  controls.maxDistance = view.maxDistance;

  // Selective bloom: render only the LED layer (everything else black) into a bloom buffer, then add it on top.
  // Threshold 0, so a blue LED glows as much as a white one, and shiny metal never does.
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));
  bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 1.15, 0.55, 0));
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const mix = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader:
        "uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv; void main() { gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }",
    }),
    "baseTexture",
  );
  mix.needsSwap = true;
  composer.addPass(mix);
  composer.addPass(new OutputPass());
  const bloomLayer = new THREE.Layers();
  bloomLayer.set(BLOOM);
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const hidden: THREE.Mesh[] = [];
  const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const renderBloom = () => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || bloomLayer.test(mesh.layers)) return;
      // Glass would hide the LEDs behind it in the bloom pass: skip it instead of blacking it out.
      if ((mesh.material as THREE.Material).transparent && mesh.visible) {
        mesh.visible = false;
        hidden.push(mesh);
      } else {
        saved.set(mesh, mesh.material);
        mesh.material = black;
      }
    });
    const bg = scene.background;
    const fog = scene.fog;
    scene.background = null;
    scene.fog = null;
    bloomComposer.render();
    scene.background = bg;
    scene.fog = fog;
    for (const [mesh, m] of saved) mesh.material = m;
    for (const mesh of hidden) mesh.visible = true;
    saved.clear();
    hidden.length = 0;
  };

  // ---- tweens (skipped under reduced motion) ----
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tweens = new Map<string, { start: number; dur: number; step: (k: number) => void }>();
  const tween = (name: string, dur: number, step: (k: number) => void) => {
    if (reduce) return step(1);
    tweens.set(name, { start: performance.now(), dur, step });
  };
  const move = (name: string, v: THREE.Vector3, to: THREE.Vector3, dur = 700) => {
    const from = v.clone();
    tween(name, dur, (k) => v.lerpVectors(from, to, ease(k)));
  };
  const fly = (pos: THREE.Vector3, target: THREE.Vector3) => {
    const p0 = camera.position.clone();
    const t0 = controls.target.clone();
    tween("camera", 900, (k) => {
      camera.position.lerpVectors(p0, pos, ease(k));
      controls.target.lerpVectors(t0, target, ease(k));
    });
  };

  // ---- lift ----
  const td = view.lift;
  const panel = td?.panel;
  const panelMat = panel?.mesh.material as THREE.MeshPhysicalMaterial | undefined;
  const panelHome = panel?.mesh.position.clone();
  const panelOpacity = panelMat?.opacity ?? 0;
  if (td) controls.minDistance = 10; // close-ups of lifted parts
  let open = !panel;
  let lifted: string | null = null;
  const toOpenView = () => fly(new THREE.Vector3(...td!.restCamera), new THREE.Vector3(...view.target));
  const setOpen = (o: boolean) => {
    if (!panel || o === open) return;
    open = o;
    const from = panelMat!.opacity;
    panel.mesh.visible = true;
    move("panel", panel.mesh.position, o ? new THREE.Vector3(...panel.off) : panelHome!);
    tween("panel-fade", 700, (k) => {
      panelMat!.opacity = from + ((o ? 0 : panelOpacity) - from) * ease(k);
      if (k >= 1 && o) panel.mesh.visible = false;
    });
    if (o) toOpenView();
    else fly(new THREE.Vector3(...view.camera), new THREE.Vector3(...view.target));
    events.onOpen?.(o);
  };
  const putBack = () => {
    if (!lifted) return;
    const p = kit.parts.get(lifted)!;
    const h = home.get(lifted)!;
    move(`g:${lifted}`, p.group.position, h.group);
    move(`l:${lifted}`, p.light.position, h.light);
    lifted = null;
  };
  const lift = (id: string) => {
    if (!td || id === lifted || !kit.parts.has(id)) return;
    putBack();
    setOpen(true);
    const p = kit.parts.get(id)!;
    const h = home.get(id)!;
    const show = new THREE.Vector3(...td.showcase);
    const delta = show.clone().sub(h.center);
    move(`g:${id}`, p.group.position, h.group.clone().add(delta), 900);
    move(`l:${id}`, p.light.position, h.light.clone().add(delta), 900);
    // Frame the part from the `look` side, far enough to fit it.
    const dir = new THREE.Vector3(...td.look).normalize();
    fly(show.clone().add(dir.multiplyScalar(h.radius * 3.2 + 10)), show);
    lifted = id;
    events.onPick(id);
  };
  const release = () => {
    if (!lifted) return;
    putBack();
    toOpenView();
    events.onPick(null);
  };

  let colors: Record<string, string> = {};
  let selected: string | null = null;
  let hover: string | null = null;
  const paint = () => {
    for (const [id, p] of kit.parts) {
      const c = colors[id];
      const k = c ? (id === selected ? 3.4 : id === hover ? 2.8 : 2.2) : 1;
      for (const m of p.glows) {
        m.emissive.set(c ?? UNLIT);
        m.emissiveIntensity = k;
      }
      p.light.color.set(c ?? 0x000000);
      p.light.intensity = c ? k * 40 : 0;
    }
    for (const [id, b] of spots) {
      if (id === "case") continue;
      const c = colors[id];
      b.classList.toggle("hotspot--rgb", !!c);
      b.style.setProperty("--spot-color", c ?? "");
      b.setAttribute("aria-label", `${events.labels[id] ?? id}, ${c ? events.rgbText : events.noRgbText}`);
    }
  };

  // ---- guide hotspots: real buttons over the canvas, one per clickable part ----
  const overlay = document.createElement("div");
  overlay.className = "hotspots";
  host.appendChild(overlay);
  const spots = new Map<string, HTMLButtonElement>();
  const anchors = new Map<string, THREE.Vector3>();
  const activate = (id: string) => {
    if (id === "case") setOpen(true);
    else if (td) lift(id);
    else events.onPick(id);
  };
  const ids = [...(panel ? ["case"] : []), ...kit.parts.keys()];
  for (const id of ids) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = id === "case" ? "hotspot hotspot--case" : "hotspot";
    const dot = document.createElement("span");
    dot.className = "hotspot__dot";
    const text = document.createElement("span");
    text.className = "hotspot__label";
    text.textContent = events.labels[id] ?? id;
    b.append(dot, text);
    if (id === "case") b.setAttribute("aria-label", events.labels.case ?? id);
    b.addEventListener("click", () => activate(id));
    b.addEventListener("pointerenter", () => {
      hover = id === "case" ? null : id;
      paint();
    });
    overlay.appendChild(b);
    spots.set(id, b);
    const at = view.anchors?.[id];
    anchors.set(id, at ? new THREE.Vector3(...at) : id === "case" ? panelHome!.clone() : home.get(id)!.center.clone());
  }
  const spot = new THREE.Vector3();
  const placeSpots = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    for (const [id, b] of spots) {
      spot.copy(anchors.get(id)!);
      // Follow a lifted part.
      if (id !== "case") spot.add(kit.parts.get(id)!.group.position).sub(home.get(id)!.group);
      spot.project(camera);
      const show = !lifted && (id === "case" ? !open : open) && spot.z < 1;
      b.hidden = !show;
      if (show) b.style.transform = `translate(${((spot.x + 1) / 2) * w}px, ${((1 - spot.y) / 2) * h}px)`;
    }
  };

  // Picking skips glass (the removable panel counts while it is on); a drag rotates instead of selecting.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** What a click here acts on: a part id, "case" (closed PC in teardown mode) or null. */
  const pick = (e: PointerEvent): string | null => {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObjects(scene.children, true)) {
      if (!hit.object.visible || (hit.object as THREE.Mesh).material === kit.m.glass) continue;
      if (td && !open) return "case";
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.part) o = o.parent;
      const id = (o?.userData.part as string | undefined) ?? null;
      if (td) return id;
      return id && colors[id] ? id : null;
    }
    return null;
  };
  let down: { x: number; y: number } | null = null;
  const el = renderer.domElement;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
      const id = pick(e);
      if (!td) {
        if (id) events.onPick(id);
      } else if (id === "case") {
        setOpen(true);
      } else if (id) {
        lift(id);
      } else {
        release(); // click on empty space puts the part back
      }
    }
    down = null;
  };
  const onMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const id = pick(e);
    el.style.cursor = id ? "pointer" : "grab";
    const part = id === "case" ? null : id;
    if (part !== hover) {
      hover = part;
      paint();
    }
  };
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointermove", onMove);

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloomComposer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let frame = 0;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    const now = performance.now();
    for (const [name, tw] of tweens) {
      const k = Math.min(1, (now - tw.start) / tw.dur);
      tw.step(k);
      if (k >= 1) tweens.delete(name);
    }
    if (!reduce) for (const s of kit.spinners) s.rotation.z += 0.06;
    controls.update();
    placeSpots();
    renderBloom();
    composer.render();
  };
  loop();

  return {
    paint(c, sel) {
      colors = c;
      selected = sel;
      paint();
    },
    focus: lift,
    release,
    close() {
      if (!td) return;
      if (lifted) events.onPick(null);
      putBack();
      if (panel) setOpen(false);
      else toOpenView();
    },
    dispose() {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
      });
      scene.environment?.dispose();
      pmrem.dispose();
      composer.dispose();
      bloomComposer.dispose();
      black.dispose();
      renderer.dispose();
      el.remove();
      overlay.remove();
    },
  };
}
