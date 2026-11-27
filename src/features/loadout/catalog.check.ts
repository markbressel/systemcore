// Self-check for the Loadout catalog (run by `npm run test:ui`).
import assert from "node:assert/strict";
import { CATALOG, iconSlug, isInstalled, pickedForPc } from "./catalog.ts";

// This PC: Ryzen 7 3700X, GTX 1060, MSI board, a Logitech mouse.
const pc = { gpus: ["NVIDIA GeForce GTX 1060 3GB"], cpu: "AMD Ryzen 7 3700X 8-Core Processor", board: "Micro-Star International Co., Ltd.", peripherals: [{ vendorId: 0x046d, name: "G502 HERO" }] };
const picked = pickedForPc(pc).map((p) => p.app.name);
assert.deepEqual(picked, ["NVIDIA App", "NVIDIA PhysX", "AMD Ryzen Master", "AMD Chipset Drivers", "MSI Center", "Logitech G HUB"]);
assert.equal(pickedForPc(pc).find((p) => p.app.name === "Logitech G HUB")?.part, "G502 HERO");
assert.deepEqual(pickedForPc({ gpus: [], cpu: null, board: null, peripherals: [] }), []);
assert.ok(pickedForPc({ ...pc, gpus: ["AMD Radeon RX 7800 XT"] }).some((p) => p.app.name.startsWith("AMD Software")));

const app = (name: string) => CATALOG.find((a) => a.name === name)!;
// winget id, or a name match for programs winget does not manage.
assert.equal(isInstalled(app("Discord"), [{ id: "ARP\\User\\X64\\Discord", name: "Discord" }]), true);
assert.equal(isInstalled(app("Steam"), [{ id: "Valve.Steam", name: "Steam" }]), true);
assert.equal(isInstalled(app("Steam"), [{ id: "x", name: "Steam Link" }]), false, "no loose name match");
assert.equal(isInstalled(app("Visual C++ Redistributable"), [{ id: "x", name: "Microsoft Visual C++ 2015-2022 Redistributable (x64) - 14.38" }]), true);
assert.equal(isInstalled(app("DirectX End-User Runtime"), []), null, "cannot be told");

// Catalog hygiene: unique names and ids, https sites, msstore entries carry a store id.
assert.equal(new Set(CATALOG.map((a) => a.name)).size, CATALOG.length);
const ids = CATALOG.flatMap((a) => (a.id ? [a.id] : []));
assert.equal(new Set(ids).size, ids.length);
for (const a of CATALOG) {
  assert.ok(a.url.startsWith("https://"), a.name);
  assert.ok(a.desc.en && a.desc.hu, a.name);
  if (a.source === "msstore") assert.match(a.id ?? "", /^[0-9A-Z]{12,14}$/, a.name);
}
assert.equal(iconSlug("Battle.net"), "battle-net");
assert.equal(iconSlug("AMD Software: Adrenalin Edition"), "amd-software-adrenalin-edition");
assert.equal(iconSlug(".NET Desktop Runtime 8"), "net-desktop-runtime-8");
console.log("loadout catalog: ok");
