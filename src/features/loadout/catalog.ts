// Loadout: hand-picked programs for gaming and PC care, plus vendor tools matched to this PC's hardware.
// winget ids were checked against the winget repository. Without one, `download` fetches the publisher's installer;
// drivers, whose download links change with every version, only link to the publisher's page.
// shortcut: hand-made list; review it when a release adds pages or when ids stop resolving in winget.

export type Category = "hardware" | "launchers" | "social" | "performance" | "maintenance" | "essentials";

export interface App {
  /** winget package id; absent for programs only offered on their website. */
  id?: string;
  /** Key of a fixed publisher download link (src-tauri/src/updater.rs DIRECT): the installer is fetched and started. */
  download?: string;
  source?: "winget" | "msstore";
  name: string;
  category: Category;
  desc: { en: string; hu: string };
  url: string;
  openSource?: boolean;
  paid?: boolean;
  /** Recognizes the program in the installed list when winget does not manage it (e.g. "ARP\User\X64\Discord"). */
  installed?: RegExp;
  /** false: Windows does not list it as an app, so "installed" cannot be told. */
  detectable?: boolean;
  /** The part of this PC it is for ("NVIDIA GeForce GTX 1060"), or null when it does not apply. */
  forPc?: (pc: PcInfo) => string | null;
}

export interface PcInfo {
  gpus: string[];
  cpu: string | null;
  board: string | null;
  /** USB vendor id and name of each detected keyboard, mouse and headset. */
  peripherals: { vendorId: number; name: string }[];
}

const gpu = (re: RegExp) => (pc: PcInfo) => pc.gpus.find((g) => re.test(g)) ?? null;
const cpu = (re: RegExp) => (pc: PcInfo) => (pc.cpu && re.test(pc.cpu) ? pc.cpu : null);
const board = (re: RegExp) => (pc: PcInfo) => (pc.board && re.test(pc.board) ? pc.board : null);
const device = (vendorId: number) => (pc: PcInfo) => pc.peripherals.find((p) => p.vendorId === vendorId)?.name ?? null;
const d = (en: string, hu: string) => ({ en, hu });

export const CATALOG: App[] = [
  // Drivers and vendor tools: only shown as "for your PC" when the hardware matches.
  { id: "XP8CLZL93F5Z4P", source: "msstore", name: "NVIDIA App", category: "hardware", url: "https://www.nvidia.com/en-us/software/nvidia-app/", installed: /^NVIDIA App/i, forPc: gpu(/nvidia|geforce/i),
    desc: d("Game Ready drivers, one-click game settings, ShadowPlay recording and the NVIDIA overlay.", "Game Ready driverek, egykattintásos játékbeállítások, ShadowPlay felvétel és NVIDIA-overlay.") },
  { id: "Nvidia.PhysX", name: "NVIDIA PhysX", category: "hardware", url: "https://www.nvidia.com/en-us/drivers/physx/physx-9-21-0713-driver/", installed: /PhysX/i, forPc: gpu(/nvidia|geforce/i),
    desc: d("Physics engine some older games need to start or to show their effects.", "Fizikamotor, ami egyes régebbi játékok indulásához vagy effektjeihez kell.") },
  { name: "AMD Software: Adrenalin Edition", category: "hardware", url: "https://www.amd.com/en/support/download/drivers.html", installed: /AMD Software/i, forPc: gpu(/amd|radeon/i),
    desc: d("Radeon drivers, game profiles, recording and performance tuning.", "Radeon driverek, játékprofilok, felvétel és teljesítményhangolás.") },
  { id: "Intel.IntelDriverAndSupportAssistant", name: "Intel Driver & Support Assistant", category: "hardware", url: "https://www.intel.com/content/www/us/en/support/detect.html", installed: /Intel.*Driver.*Support/i, forPc: (pc) => gpu(/intel|arc/i)(pc) ?? cpu(/intel/i)(pc),
    desc: d("Finds the latest drivers for Intel processors, graphics, Wi-Fi and Bluetooth.", "Megkeresi a legfrissebb drivereket Intel processzorhoz, grafikához, Wi-Fi-hez és Bluetooth-hoz.") },
  { name: "AMD Ryzen Master", download: "amd-ryzen-master", category: "hardware", url: "https://www.amd.com/en/products/software/ryzen-master.html", installed: /Ryzen Master/i, forPc: cpu(/ryzen/i),
    desc: d("AMD's own tool for Ryzen clocks, Precision Boost Overdrive and Curve Optimizer.", "Az AMD saját eszköze a Ryzen órajelekhez, a Precision Boost Overdrive-hoz és a Curve Optimizerhez.") },
  { name: "AMD Chipset Drivers", category: "hardware", url: "https://www.amd.com/en/support/download/drivers.html", installed: /AMD Chipset Software/i, forPc: cpu(/ryzen|amd/i),
    desc: d("Power plans and scheduler fixes that help Ryzen boost properly in games.", "Energiasémák és ütemező-javítások, amelyekkel a Ryzen játékban rendesen boostol.") },
  { id: "MSI.MSICenter", name: "MSI Center", category: "hardware", url: "https://www.msi.com/Landing/MSI-Center", installed: /^MSI Center/i, forPc: board(/micro-star|msi/i),
    desc: d("MSI's motherboard tool: BIOS and driver updates, fan tuning and Mystic Light.", "Az MSI alaplapi eszköze: BIOS- és driverfrissítés, ventilátorhangolás és Mystic Light.") },
  { id: "Asus.ArmouryCrate", name: "Armoury Crate", category: "hardware", url: "https://rog.asus.com/armoury-crate/", installed: /Armoury Crate/i, forPc: board(/asus/i),
    desc: d("ASUS motherboard and ROG device control: drivers, fans and Aura lighting.", "ASUS alaplap és ROG-eszközök vezérlése: driverek, ventilátorok és Aura világítás.") },
  { id: "Logitech.GHUB", name: "Logitech G HUB", category: "hardware", url: "https://www.logitechg.com/innovation/g-hub.html", installed: /G HUB/i, forPc: device(0x046d),
    desc: d("Buttons, DPI, macros and firmware for Logitech G gear. SystemCore already handles its lighting.", "Gombok, DPI, makrók és firmware a Logitech G eszközökhöz. A világítást a SystemCore is kezeli.") },
  { id: "RazerInc.RazerInstaller.Synapse4", name: "Razer Synapse 4", category: "hardware", url: "https://www.razer.com/synapse-4", installed: /Razer Synapse/i, forPc: device(0x1532),
    desc: d("Button mapping, DPI and firmware for Razer devices.", "Gombkiosztás, DPI és firmware a Razer eszközökhöz.") },
  { id: "SteelSeries.GG", name: "SteelSeries GG", category: "hardware", url: "https://steelseries.com/gg", installed: /SteelSeries GG/i, forPc: device(0x1038),
    desc: d("Settings, Sonar audio mixer and firmware for SteelSeries gear.", "Beállítások, Sonar hangkeverő és firmware a SteelSeries eszközökhöz.") },
  { id: "Corsair.iCUE.5", name: "Corsair iCUE", category: "hardware", url: "https://www.corsair.com/icue", installed: /iCUE/i, forPc: device(0x1b1c),
    desc: d("Lighting, fans and keys for Corsair devices and coolers.", "Világítás, ventilátorok és billentyűk a Corsair eszközökhöz és hűtőkhöz.") },

  // Game launchers and stores.
  { id: "Valve.Steam", name: "Steam", category: "launchers", url: "https://store.steampowered.com/about/", installed: /^Steam$/i,
    desc: d("The biggest PC game store, with friends, workshop mods and Steam Deck sync.", "A legnagyobb PC-s játékbolt barátlistával, workshop modokkal és Steam Deck szinkronnal.") },
  { id: "EpicGames.EpicGamesLauncher", name: "Epic Games Launcher", category: "launchers", url: "https://store.epicgames.com/", installed: /Epic Games Launcher/i,
    desc: d("Fortnite, Unreal games and a free game every week.", "Fortnite, Unreal-játékok és minden héten egy ingyenes játék.") },
  { id: "GOG.Galaxy", name: "GOG Galaxy", category: "launchers", url: "https://www.gog.com/galaxy", installed: /GOG GALAXY/i,
    desc: d("DRM-free games, and one library for all your other launchers.", "DRM-mentes játékok, és egy közös könyvtár az összes többi launcherhez.") },
  { id: "ElectronicArts.EADesktop", name: "EA app", category: "launchers", url: "https://www.ea.com/ea-app", installed: /^EA app/i,
    desc: d("EA games: EA SPORTS FC, Battlefield, The Sims, Apex Legends.", "EA-játékok: EA SPORTS FC, Battlefield, The Sims, Apex Legends.") },
  { id: "Ubisoft.Connect", name: "Ubisoft Connect", category: "launchers", url: "https://ubisoftconnect.com/", installed: /Ubisoft Connect/i,
    desc: d("Assassin's Creed, Far Cry, Rainbow Six and the other Ubisoft games.", "Assassin's Creed, Far Cry, Rainbow Six és a többi Ubisoft-játék.") },
  { id: "Blizzard.BattleNet", name: "Battle.net", category: "launchers", url: "https://www.blizzard.com/apps/battle.net/desktop", installed: /Battle\.net/i,
    desc: d("Call of Duty, Diablo, Overwatch, World of Warcraft.", "Call of Duty, Diablo, Overwatch, World of Warcraft.") },
  { id: "Playnite.Playnite", name: "Playnite", category: "launchers", url: "https://playnite.link/", installed: /^Playnite/i, openSource: true,
    desc: d("One open-source library for Steam, Epic, GOG, EA, Ubisoft, emulators and more.", "Egyetlen nyílt forrású könyvtár Steamhez, Epichez, GOG-hoz, EA-hoz, Ubisofthoz, emulátorokhoz és még sok máshoz.") },
  { id: "Nvidia.GeForceNow", name: "GeForce NOW", category: "launchers", url: "https://www.nvidia.com/en-us/geforce-now/", installed: /GeForce NOW/i,
    desc: d("Cloud gaming: play your games on NVIDIA's servers when your PC is not enough.", "Felhős játék: az NVIDIA szerverein fut a játék, ha a géped kevés hozzá.") },
  { id: "Overwolf.CurseForge", name: "CurseForge", category: "launchers", url: "https://www.curseforge.com/download/app", installed: /CurseForge/i,
    desc: d("Mods and modpacks for Minecraft, WoW, The Sims 4 and more.", "Modok és modcsomagok Minecrafthoz, WoW-hoz, The Sims 4-hez és másokhoz.") },

  // Voice, streaming and clips.
  { id: "Discord.Discord", name: "Discord", category: "social", url: "https://discord.com/", installed: /^Discord$/i,
    desc: d("Voice chat, servers and screen sharing with your squad.", "Hangcsevegés, szerverek és képernyőmegosztás a csapatoddal.") },
  { id: "TeamSpeakSystems.TeamSpeakClient", name: "TeamSpeak", category: "social", url: "https://www.teamspeak.com/", installed: /TeamSpeak/i,
    desc: d("Low-latency voice chat, popular with clans and simulators.", "Alacsony késleltetésű hangcsevegés, klánok és szimulátorosok kedvence.") },
  { id: "OBSProject.OBSStudio", name: "OBS Studio", category: "social", url: "https://obsproject.com/", installed: /^OBS Studio/i, openSource: true,
    desc: d("Free streaming and recording to Twitch, YouTube and Kick.", "Ingyenes streamelés és felvétel Twitchre, YouTube-ra és Kickre.") },
  { id: "MedalB.V.Medal", name: "Medal", category: "social", url: "https://medal.tv/", installed: /^Medal/i,
    desc: d("Clips your best moments automatically and shares them in seconds.", "Automatikusan klipeli a legjobb pillanataidat, és másodpercek alatt megosztja.") },
  { id: "Parsec.Parsec", name: "Parsec", category: "social", url: "https://parsec.app/", installed: /^Parsec/i,
    desc: d("Play local co-op games with friends over the internet, or stream your PC to another device.", "Helyi kooperatív játék barátokkal az interneten át, vagy a géped streamelése egy másik eszközre.") },

  // Monitoring and tuning.
  { id: "LibreHardwareMonitor.LibreHardwareMonitor", name: "LibreHardwareMonitor", category: "performance", url: "https://github.com/LibreHardwareMonitor/LibreHardwareMonitor", installed: /LibreHardwareMonitor/i, openSource: true,
    desc: d("Sensor reader. While it runs, SystemCore can show CPU temperature on more PCs.", "Szenzorolvasó. Amíg fut, a SystemCore több gépen is mutatja a CPU-hőmérsékletet.") },
  { id: "Guru3D.Afterburner", name: "MSI Afterburner", category: "performance", url: "https://www.msi.com/Landing/afterburner/graphics-cards", installed: /Afterburner/i,
    desc: d("Graphics card overclocking, undervolting and custom fan curves.", "Videókártya-tuning, feszültségcsökkentés és saját ventilátorgörbék.") },
  { id: "REALiX.HWiNFO", name: "HWiNFO", category: "performance", url: "https://www.hwinfo.com/", installed: /^HWiNFO/i,
    desc: d("Every sensor in the PC, with logging: the go-to tool when hunting a hardware problem.", "A gép összes szenzora naplózással: az első eszköz, ha hardverhibát keresel.") },
  { id: "CPUID.CPU-Z", name: "CPU-Z", category: "performance", url: "https://www.cpuid.com/softwares/cpu-z.html", installed: /CPU-Z/i,
    desc: d("Exact processor, motherboard and RAM details, with a quick CPU benchmark.", "Pontos processzor-, alaplap- és RAM-adatok, gyors CPU-benchmarkkal.") },
  { id: "TechPowerUp.GPU-Z", name: "GPU-Z", category: "performance", url: "https://www.techpowerup.com/gpuz/", installed: /GPU-Z/i,
    desc: d("Everything about the graphics card, including whether it runs at full PCIe speed.", "Minden a videókártyáról, azt is beleértve, hogy teljes PCIe-sebességen fut-e.") },
  { id: "Rem0o.FanControl", name: "FanControl", category: "performance", url: "https://getfancontrol.com/", installed: /^FanControl/i, openSource: true,
    desc: d("Quiet, custom fan curves for case and CPU fans, without the motherboard's software.", "Csendes, saját ventilátorgörbék a ház- és CPU-ventilátorokhoz, alaplapi program nélkül.") },
  { id: "CrystalDewWorld.CrystalDiskMark", name: "CrystalDiskMark", category: "performance", url: "https://crystalmark.info/en/software/crystaldiskmark/", installed: /CrystalDiskMark/i, openSource: true,
    desc: d("Measures how fast your SSD or hard drive really is.", "Megméri, milyen gyors valójában az SSD-d vagy a merevlemezed.") },

  // Cleanup and maintenance.
  { id: "CrystalDewWorld.CrystalDiskInfo", name: "CrystalDiskInfo", category: "maintenance", url: "https://crystalmark.info/en/software/crystaldiskinfo/", installed: /CrystalDiskInfo/i, openSource: true,
    desc: d("Drive health (S.M.A.R.T.), SSD wear and temperature, with warnings before a drive dies.", "Meghajtóállapot (S.M.A.R.T.), SSD-kopás és hőfok, figyelmeztetéssel, mielőtt a meghajtó tönkremegy.") },
  { id: "Wagnardsoft.DisplayDriverUninstaller", name: "Display Driver Uninstaller", category: "maintenance", url: "https://www.wagnardsoft.com/", installed: /Display Driver Uninstaller/i,
    desc: d("Removes a graphics driver completely: the fix for crashes after a driver update or a GPU swap.", "Teljesen eltávolítja a videókártya-drivert: megoldás driverfrissítés vagy kártyacsere utáni hibákra.") },
  { id: "AntibodySoftware.WizTree", name: "WizTree", category: "maintenance", url: "https://diskanalyzer.com/", installed: /WizTree/i,
    desc: d("Shows in seconds what fills your drive, as a map of blocks.", "Másodpercek alatt megmutatja, mi tölti meg a meghajtót, blokktérképként.") },
  { id: "Klocman.BulkCrapUninstaller", name: "Bulk Crap Uninstaller", category: "maintenance", url: "https://www.bcuninstaller.com/", installed: /BCUninstaller|Bulk Crap/i, openSource: true,
    desc: d("Removes many programs at once, with their leftovers.", "Egyszerre sok programot távolít el, a maradékaikkal együtt.") },
  { id: "Microsoft.Sysinternals.Autoruns", name: "Autoruns", category: "maintenance", url: "https://learn.microsoft.com/sysinternals/downloads/autoruns", installed: /Autoruns/i, detectable: false,
    desc: d("Microsoft's deep view of everything that starts with Windows, beyond the Startup Apps page.", "A Microsoft részletes listája mindenről, ami a Windows-zal indul, az Indítópult oldalon túl is.") },
  { id: "Microsoft.PowerToys", name: "PowerToys", category: "maintenance", url: "https://learn.microsoft.com/windows/powertoys/", installed: /PowerToys/i, openSource: true,
    desc: d("Microsoft's power-user extras: window layouts, quick launcher, color picker and more.", "A Microsoft haladó kiegészítői: ablakelrendezések, gyorsindító, színválasztó és még sok más.") },

  // Runtimes games need, and everyday basics.
  { id: "Microsoft.VCRedist.2015+.x64", name: "Visual C++ Redistributable", category: "essentials", url: "https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist", installed: /Visual C\+\+ (v14|2015-20\d\d) Redistributable \(x64\)/i,
    desc: d("Needed by most games; a missing or broken copy causes \"VCRUNTIME140.dll not found\".", "A legtöbb játéknak kell; ha hiányzik vagy sérült, jön a „VCRUNTIME140.dll nem található” hiba.") },
  { id: "Microsoft.DirectX", name: "DirectX End-User Runtime", category: "essentials", url: "https://www.microsoft.com/download/details.aspx?id=35", detectable: false,
    desc: d("Older DirectX files that many pre-2015 games still need (d3dx9, xinput1_3).", "Régebbi DirectX-fájlok, amelyek sok 2015 előtti játéknak még kellenek (d3dx9, xinput1_3).") },
  { id: "Microsoft.DotNet.DesktopRuntime.8", name: ".NET Desktop Runtime 8", category: "essentials", url: "https://dotnet.microsoft.com/download/dotnet/8.0", installed: /\.NET Windows Desktop Runtime 8/i,
    desc: d("Needed by many launchers, mod managers and tools.", "Sok launchernek, modkezelőnek és eszköznek kell.") },
  { id: "7zip.7zip", name: "7-Zip", category: "essentials", url: "https://www.7-zip.org/", installed: /^7-Zip/i, openSource: true,
    desc: d("Opens every archive (zip, rar, 7z) that mods and game files come in.", "Minden tömörített fájlt megnyit (zip, rar, 7z), amiben modok és játékfájlok érkeznek.") },
  { id: "VideoLAN.VLC", name: "VLC media player", category: "essentials", url: "https://www.videolan.org/vlc/", installed: /^VLC media player/i, openSource: true,
    desc: d("Plays any video, including your game recordings.", "Bármilyen videót lejátszik, a játékfelvételeidet is.") },
  { id: "Mozilla.Firefox", name: "Firefox", category: "essentials", url: "https://www.mozilla.org/firefox/", installed: /^Mozilla Firefox/i, openSource: true,
    desc: d("Fast, private browser that uses little memory next to a running game.", "Gyors, adatvédő böngésző, ami játék mellett is kevés memóriát eszik.") },
  { id: "Spotify.Spotify", name: "Spotify", category: "essentials", url: "https://www.spotify.com/download/", installed: /^Spotify/i,
    desc: d("Music while you play.", "Zene játék közben.") },
];

/** File name stem of the app's icon in src/assets/apps ("Battle.net" -> "battle-net"). */
export const iconSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Installed when winget lists its package id, or a program whose name matches. Null when it cannot be told. */
export function isInstalled(app: App, installed: { id: string; name: string }[]): boolean | null {
  if (app.detectable === false) return null;
  return installed.some((p) => (app.id && p.id.toLowerCase() === app.id.toLowerCase()) || (app.installed?.test(p.name) ?? false));
}

/** Vendor tools for this PC's parts, with the part each one is for. */
export const pickedForPc = (pc: PcInfo) => CATALOG.flatMap((app) => {
  const part = app.forPc?.(pc);
  return part ? [{ app, part }] : [];
});
