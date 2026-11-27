// "What's new in SystemCore", newest first. Ships with the app, so it always matches the installed version.
// Release checklist: rename the "next" entry to the new version and date when tagging (add a new "next" entry for
// unreleased work).

export interface Release {
  /** "next" = changes not released yet. */
  version: string;
  date: string;
  title: { en: string; hu: string };
  items: { en: string; hu: string }[];
}

const item = (en: string, hu: string) => ({ en, hu });

export const CHANGELOG: Release[] = [
  {
    version: "0.4.0",
    date: "2026-11-27",
    title: { en: "Game check, news, Updater, Loadout and more RGB hardware", hu: "Játékellenőrzés, hírek, Frissítő, Felszerelés és több RGB-hardver" },
    items: [
      item("Updater page: see which installed programs have an update, the download size and the free space left, then update them in one go (winget)", "Frissítő oldal: mely telepített programokhoz van frissítés, mekkora a letöltés és mennyi hely marad, majd egy kattintással frissíthetők (winget)"),
      item("Loadout page: game launchers, voice and streaming apps, monitoring and cleanup tools, plus the drivers and vendor tools made for your parts, installed in one click", "Felszerelés oldal: játékindítók, hang- és streamelőprogramok, figyelő- és takarítóeszközök, valamint az alkatrészeidhez való driverek és gyártói programok, egy kattintással telepítve"),
      item("RGB: ASRock Polychrome and Gigabyte RGB Fusion motherboards (USB and older SMBus boards), with the fans and coolers on their headers (Deepcool and others)", "RGB: ASRock Polychrome és Gigabyte RGB Fusion alaplapok (USB-s és régebbi SMBus-os lapok), a csatlakozóikra kötött ventilátorokkal és hűtőkkel (Deepcool és mások)"),
      item("RGB: Gigabyte AORUS and ASRock Radeon graphics cards (tested models only)", "RGB: Gigabyte AORUS és ASRock Radeon videókártyák (csak ellenőrzött modellek)"),
      item("RGB: newer Logitech mice and keyboards (RGB Effects), Logitech keyboards and Bluetooth devices, single-color Keychron backlights", "RGB: újabb Logitech egerek és billentyűzetek (RGB Effects), Logitech billentyűzetek és Bluetooth-eszközök, egyszínű Keychron háttérvilágítás"),
      item("About page with a feedback form: bug reports and ideas go straight to the developer", "Névjegy oldal visszajelzés-űrlappal: a hibajelentések és ötletek egyenesen a fejlesztőhöz jutnak"),
      item("Safety: no SMBus lighting access on DDR5 systems; Logitech colors are no longer saved to the device's memory", "Biztonság: DDR5-ös gépen nincs SMBus-világításhozzáférés; a Logitech-színek már nem mentődnek az eszköz memóriájába"),
      item("Consistent bars, inputs, checkboxes and loading indicators across every page", "Egységes sávok, szövegmezők, jelölőnégyzetek és betöltésjelzők minden oldalon"),
      item("News page: the latest IT, hardware and gaming news from Hungarian and English sites, plus this changelog", "Hírek oldal: a legfrissebb IT-, hardver- és gaming hírek magyar és angol oldalakról, valamint ez a változásnapló"),
      item("Benchmark: search any game on Steam and see how it would run, its minimum and recommended specs and what to upgrade", "Benchmark: bármelyik játék kereshető a Steamen, megmutatja, hogyan futna, mi a minimum és ajánlott gépigénye, és mit kell fejleszteni"),
      item("Overlay: CPU and GPU temperature shown big next to the label, red when the part runs hot", "Overlay: a CPU és GPU hőfoka nagyban a felirat mellett, pirosan, ha túlmelegszik"),
      item("Network: the program list only changes when you press Refresh", "Hálózat: a programlista csak a Frissítés gombra változik"),
    ],
  },
  {
    version: "0.3.0",
    date: "2026-11-27",
    title: { en: "RGB lighting, display profiles and Ryzen temperature", hu: "RGB-világítás, kijelzőprofilok és Ryzen-hőmérséklet" },
    items: [
      item("PC lighting and Peripherals pages with 3D scenes: take the PC apart and pick up your devices", "PC-világítás és Perifériák oldal 3D-s jelenetekkel: szedd szét a gépet, vedd kézbe az eszközeidet"),
      item("RGB control without vendor software: Windows Dynamic Lighting, Logitech, Razer, VIA/QMK keyboards and RGB RAM", "RGB-vezérlés gyártói program nélkül: Windows Dynamic Lighting, Logitech, Razer, VIA/QMK billentyűzetek és RGB RAM"),
      item("Display page: brightness, contrast, gamma, color temperature, NVIDIA vibrance and per-game color profiles", "Kijelző oldal: fényerő, kontraszt, gamma, színhőmérséklet, NVIDIA vibrance és játékonkénti színprofilok"),
      item("CPU temperature straight from the Ryzen sensor", "CPU-hőmérséklet közvetlenül a Ryzen szenzorából"),
      item("Redesigned Overview cockpit with temperature dials", "Megújult Áttekintés-műszerfal hőmérséklet-mutatókkal"),
    ],
  },
  {
    version: "0.2.0",
    date: "2026-11-26",
    title: { en: "Health score, benchmark and Hungarian UI", hu: "Állapotpontszám, benchmark és magyar felület" },
    items: [
      item("PC health score and a 10-second \"Why is my PC slow?\" diagnosis", "Gépállapot-pontszám és 10 másodperces „Miért lassú a gépem?” diagnózis"),
      item("Benchmark page: CPU and GPU load test with temperature curve and run history", "Benchmark oldal: CPU- és GPU-terhelésteszt hőmérsékletgörbével és korábbi mérésekkel"),
      item("Overheating (thermal throttling) detection with alerts", "Túlmelegedés (hőmérsékleti lassítás) felismerése riasztással"),
      item("Network usage per program, game session summaries, bottleneck indicator in the overlay", "Programonkénti hálózathasználat, játékmenet-összesítők, szűk keresztmetszet jelző az overlay-en"),
      item("Storage cleanup, light theme, custom accent color and Hungarian language", "Tárhely-takarítás, világos téma, saját kiemelőszín és magyar nyelv"),
    ],
  },
  {
    version: "0.1.1",
    date: "2026-11-25",
    title: { en: "FPS overlay, history and alerts", hu: "FPS-overlay, előzmények és riasztások" },
    items: [
      item("FPS, frame time and 1% low in the overlay; it can open by itself when a game goes fullscreen", "FPS, képkocka-idő és 1% low az overlay-en; magától megnyílhat, ha egy játék teljes képernyős lesz"),
      item("History page, Startup Apps page, ping and process actions", "Előzmények és Indítópult oldal, ping és folyamatműveletek"),
      item("Tray icon, start with Windows, Ctrl+Shift+O overlay hotkey and temperature/RAM notifications", "Tálcaikon, indulás a Windows-zal, Ctrl+Shift+O overlay-gyorsbillentyű és hőfok/RAM értesítések"),
    ],
  },
  {
    version: "0.1.0",
    date: "2026-11-25",
    title: { en: "First release", hu: "Első kiadás" },
    items: [item("Live CPU, GPU, memory, disk and network monitoring with an always-on-top overlay", "Élő CPU-, GPU-, memória-, lemez- és hálózatfigyelés, mindig felül lévő overlay-jel")],
  },
];
