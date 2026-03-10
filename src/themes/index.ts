/**
 * Theme definitions for IoTUI.
 *
 * Every colour value is an RGB triplet string (e.g. "8 11 18") so that
 * Tailwind's `/<alpha>` opacity syntax works when the token is consumed
 * via a CSS custom-property:
 *
 *   color: rgb(var(--iot-bg-base) / 0.5)
 *
 * The structure mirrors the `iot-*` design tokens used throughout the app.
 */

export interface ThemePalette {
  /** Human-readable display name */
  name: string;
  /** Unique machine key */
  id: string;

  bg: {
    base: string;
    surface: string;
    elevated: string;
    hover: string;
  };
  border: {
    default: string;
    light: string;
    focus: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    disabled: string;
  };
  accent: {
    cyan: string;
    amber: string;
    red: string;
    blue: string;
    purple: string;
    green: string;
  };
  /** Scrollbar colours (rgb triplets) */
  scrollbar: {
    track: string;
    thumb: string;
    thumbHover: string;
  };
  /** Grid overlay line colour (rgb triplet) */
  grid: string;
}

// ─── Helper ──────────────────────────────────────────────────────
/** Convert "#rrggbb" to "r g b" triplet string. */
function hex(h: string): string {
  const c = h.replace("#", "");
  return `${parseInt(c.slice(0, 2), 16)} ${parseInt(c.slice(2, 4), 16)} ${parseInt(c.slice(4, 6), 16)}`;
}

// ─── Theme Definitions ───────────────────────────────────────────

const iot1: ThemePalette = {
  name: "IoT-1",
  id: "iot-1",
  bg: { base: hex("#080b12"), surface: hex("#0f1420"), elevated: hex("#161c2a"), hover: hex("#1c2333") },
  border: { default: hex("#1e2a3a"), light: hex("#2a3650"), focus: hex("#3b82f6") },
  text: { primary: hex("#f0f4f8"), secondary: hex("#94a3b8"), muted: hex("#71839d"), disabled: hex("#637185") },
  accent: { cyan: hex("#00d4aa"), amber: hex("#f59e0b"), red: hex("#ef4444"), blue: hex("#3b82f6"), purple: hex("#a855f7"), green: hex("#22c55e") },
  scrollbar: { track: hex("#0f1420"), thumb: hex("#2a3650"), thumbHover: hex("#3b4a6b") },
  grid: hex("#1e2a3a"),
};

const iot2: ThemePalette = {
  name: "IoT-2",
  id: "iot-2",
  bg: { base: hex("#0e1117"), surface: hex("#161b22"), elevated: hex("#1c2129"), hover: hex("#252c35") },
  border: { default: hex("#30363d"), light: hex("#3d444d"), focus: hex("#58a6ff") },
  text: { primary: hex("#e6edf3"), secondary: hex("#959ca5"), muted: hex("#808b96"), disabled: hex("#717881") },
  accent: { cyan: hex("#39d2c0"), amber: hex("#d29922"), red: hex("#f85149"), blue: hex("#58a6ff"), purple: hex("#bc8cff"), green: hex("#3fb950") },
  scrollbar: { track: hex("#161b22"), thumb: hex("#30363d"), thumbHover: hex("#484f58") },
  grid: hex("#21262d"),
};

const aura: ThemePalette = {
  name: "Aura",
  id: "aura",
  bg: { base: hex("#15141b"), surface: hex("#1c1b22"), elevated: hex("#232229"), hover: hex("#2b2a33") },
  border: { default: hex("#2e2d36"), light: hex("#3d3c47"), focus: hex("#a277ff") },
  text: { primary: hex("#edecee"), secondary: hex("#a8a5b2"), muted: hex("#8a879b"), disabled: hex("#777588") },
  accent: { cyan: hex("#61ffca"), amber: hex("#ffca85"), red: hex("#ff6767"), blue: hex("#82e2ff"), purple: hex("#a277ff"), green: hex("#61ffca") },
  scrollbar: { track: hex("#1c1b22"), thumb: hex("#3d3c47"), thumbHover: hex("#514f5c") },
  grid: hex("#2e2d36"),
};

const ayu: ThemePalette = {
  name: "Ayu",
  id: "ayu",
  bg: { base: hex("#0b0e14"), surface: hex("#0f131a"), elevated: hex("#151920"), hover: hex("#1c2029") },
  border: { default: hex("#1e222a"), light: hex("#2b303b"), focus: hex("#e6b450") },
  text: { primary: hex("#bfbdb6"), secondary: hex("#919085"), muted: hex("#807f7c"), disabled: hex("#6e6d6a") },
  accent: { cyan: hex("#95e6cb"), amber: hex("#e6b450"), red: hex("#d95757"), blue: hex("#59c2ff"), purple: hex("#d2a6ff"), green: hex("#7fd962") },
  scrollbar: { track: hex("#0f131a"), thumb: hex("#2b303b"), thumbHover: hex("#3b4049") },
  grid: hex("#1e222a"),
};

const carbonfox: ThemePalette = {
  name: "Carbonfox",
  id: "carbonfox",
  bg: { base: hex("#161616"), surface: hex("#1e1e1e"), elevated: hex("#252525"), hover: hex("#2e2e2e") },
  border: { default: hex("#353535"), light: hex("#444444"), focus: hex("#33b1ff") },
  text: { primary: hex("#f2f4f8"), secondary: hex("#b6b8bb"), muted: hex("#898d90"), disabled: hex("#787a7e") },
  accent: { cyan: hex("#08bdba"), amber: hex("#f1c21b"), red: hex("#ee5396"), blue: hex("#33b1ff"), purple: hex("#be95ff"), green: hex("#42be65") },
  scrollbar: { track: hex("#1e1e1e"), thumb: hex("#444444"), thumbHover: hex("#525356") },
  grid: hex("#2a2a2a"),
};

const catppuccin: ThemePalette = {
  name: "Catppuccin",
  id: "catppuccin",
  bg: { base: hex("#1e1e2e"), surface: hex("#24243e"), elevated: hex("#2a2a48"), hover: hex("#313150") },
  border: { default: hex("#36365a"), light: hex("#45457a"), focus: hex("#89b4fa") },
  text: { primary: hex("#cdd6f4"), secondary: hex("#a6adc8"), muted: hex("#8c92ae"), disabled: hex("#7c7f94") },
  accent: { cyan: hex("#94e2d5"), amber: hex("#f9e2af"), red: hex("#f38ba8"), blue: hex("#89b4fa"), purple: hex("#cba6f7"), green: hex("#a6e3a1") },
  scrollbar: { track: hex("#24243e"), thumb: hex("#45457a"), thumbHover: hex("#585b70") },
  grid: hex("#2a2a48"),
};

const dracula: ThemePalette = {
  name: "Dracula",
  id: "dracula",
  bg: { base: hex("#282a36"), surface: hex("#2d2f3d"), elevated: hex("#343746"), hover: hex("#3c3f52") },
  border: { default: hex("#44475a"), light: hex("#565970"), focus: hex("#bd93f9") },
  text: { primary: hex("#f8f8f2"), secondary: hex("#bfc1cc"), muted: hex("#89a0e6"), disabled: hex("#898caa") },
  accent: { cyan: hex("#8be9fd"), amber: hex("#f1fa8c"), red: hex("#ff5555"), blue: hex("#8be9fd"), purple: hex("#bd93f9"), green: hex("#50fa7b") },
  scrollbar: { track: hex("#2d2f3d"), thumb: hex("#565970"), thumbHover: hex("#6272a4") },
  grid: hex("#383a4a"),
};

const gruvbox: ThemePalette = {
  name: "Gruvbox",
  id: "gruvbox",
  bg: { base: hex("#1d2021"), surface: hex("#282828"), elevated: hex("#32302f"), hover: hex("#3c3836") },
  border: { default: hex("#3c3836"), light: hex("#504945"), focus: hex("#d79921") },
  text: { primary: hex("#ebdbb2"), secondary: hex("#bdae93"), muted: hex("#a79687"), disabled: hex("#918377") },
  accent: { cyan: hex("#8ec07c"), amber: hex("#d79921"), red: hex("#fb4934"), blue: hex("#83a598"), purple: hex("#d3869b"), green: hex("#b8bb26") },
  scrollbar: { track: hex("#282828"), thumb: hex("#504945"), thumbHover: hex("#665c54") },
  grid: hex("#3c3836"),
};

const monokai: ThemePalette = {
  name: "Monokai",
  id: "monokai",
  bg: { base: hex("#1e1f1c"), surface: hex("#272822"), elevated: hex("#2e2f2a"), hover: hex("#3a3b35") },
  border: { default: hex("#3b3c35"), light: hex("#4e4f48"), focus: hex("#a6e22e") },
  text: { primary: hex("#f8f8f2"), secondary: hex("#c5c5b8"), muted: hex("#a19b81"), disabled: hex("#89887a") },
  accent: { cyan: hex("#66d9ef"), amber: hex("#e6db74"), red: hex("#ff297a"), blue: hex("#66d9ef"), purple: hex("#ae81ff"), green: hex("#a6e22e") },
  scrollbar: { track: hex("#272822"), thumb: hex("#4e4f48"), thumbHover: hex("#75715e") },
  grid: hex("#3b3c35"),
};

const nightOwl: ThemePalette = {
  name: "Night Owl",
  id: "night-owl",
  bg: { base: hex("#011627"), surface: hex("#051b2e"), elevated: hex("#0b2236"), hover: hex("#112a3e") },
  border: { default: hex("#1b3b52"), light: hex("#254b65"), focus: hex("#7fdbca") },
  text: { primary: hex("#d6deeb"), secondary: hex("#a7b7c9"), muted: hex("#738b8b"), disabled: hex("#667878") },
  accent: { cyan: hex("#7fdbca"), amber: hex("#ecc48d"), red: hex("#ef5350"), blue: hex("#82aaff"), purple: hex("#c792ea"), green: hex("#22da6e") },
  scrollbar: { track: hex("#051b2e"), thumb: hex("#254b65"), thumbHover: hex("#3a6080") },
  grid: hex("#0d2640"),
};

const nord: ThemePalette = {
  name: "Nord",
  id: "nord",
  bg: { base: hex("#2e3440"), surface: hex("#333a47"), elevated: hex("#3b4252"), hover: hex("#434c5e") },
  border: { default: hex("#434c5e"), light: hex("#4c566a"), focus: hex("#88c0d0") },
  text: { primary: hex("#eceff4"), secondary: hex("#d8dee9"), muted: hex("#a6b3cc"), disabled: hex("#8a9dc2") },
  accent: { cyan: hex("#88c0d0"), amber: hex("#ebcb8b"), red: hex("#ee7984"), blue: hex("#81a1c1"), purple: hex("#b791b0"), green: hex("#a3be8c") },
  scrollbar: { track: hex("#333a47"), thumb: hex("#4c566a"), thumbHover: hex("#616e88") },
  grid: hex("#3b4252"),
};

const oneDarkPro: ThemePalette = {
  name: "One Dark Pro",
  id: "one-dark-pro",
  bg: { base: hex("#1e2127"), surface: hex("#23272e"), elevated: hex("#282c34"), hover: hex("#2c313a") },
  border: { default: hex("#3b4048"), light: hex("#4b5263"), focus: hex("#61afef") },
  text: { primary: hex("#abb2bf"), secondary: hex("#9ba2ae"), muted: hex("#8690a3"), disabled: hex("#767d8e") },
  accent: { cyan: hex("#56b6c2"), amber: hex("#e5c07b"), red: hex("#e06c75"), blue: hex("#61afef"), purple: hex("#c678dd"), green: hex("#98c379") },
  scrollbar: { track: hex("#23272e"), thumb: hex("#4b5263"), thumbHover: hex("#5c6370") },
  grid: hex("#2c313a"),
};

const shadesOfPurple: ThemePalette = {
  name: "Shades of Purple",
  id: "shades-of-purple",
  bg: { base: hex("#1e1e3f"), surface: hex("#252552"), elevated: hex("#2d2b5e"), hover: hex("#36346b") },
  border: { default: hex("#3d3b78"), light: hex("#4e4c8a"), focus: hex("#fad000") },
  text: { primary: hex("#e9e0ff"), secondary: hex("#b1a9d1"), muted: hex("#9d93d4"), disabled: hex("#8882b3") },
  accent: { cyan: hex("#80ffea"), amber: hex("#fad000"), red: hex("#ff628c"), blue: hex("#9effff"), purple: hex("#a599e9"), green: hex("#3ad900") },
  scrollbar: { track: hex("#252552"), thumb: hex("#4e4c8a"), thumbHover: hex("#5a5485") },
  grid: hex("#2d2b5e"),
};

const solarized: ThemePalette = {
  name: "Solarized",
  id: "solarized",
  bg: { base: hex("#002b36"), surface: hex("#003340"), elevated: hex("#073642"), hover: hex("#0d3f4d") },
  border: { default: hex("#1a4f5c"), light: hex("#2a6070"), focus: hex("#268bd2") },
  text: { primary: hex("#fdf6e3"), secondary: hex("#a2b0b0"), muted: hex("#889ea6"), disabled: hex("#6f8b94") },
  accent: { cyan: hex("#2aa198"), amber: hex("#b58900"), red: hex("#f24845"), blue: hex("#268bd2"), purple: hex("#787eda"), green: hex("#859900") },
  scrollbar: { track: hex("#003340"), thumb: hex("#2a6070"), thumbHover: hex("#3a7888") },
  grid: hex("#094050"),
};

const tokyonight: ThemePalette = {
  name: "Tokyonight",
  id: "tokyonight",
  bg: { base: hex("#1a1b26"), surface: hex("#1e2030"), elevated: hex("#24283b"), hover: hex("#292e42") },
  border: { default: hex("#2f3549"), light: hex("#3b4261"), focus: hex("#7aa2f7") },
  text: { primary: hex("#c0caf5"), secondary: hex("#9aa5ce"), muted: hex("#838cb6"), disabled: hex("#6c78ad") },
  accent: { cyan: hex("#7dcfff"), amber: hex("#e0af68"), red: hex("#f7768e"), blue: hex("#7aa2f7"), purple: hex("#bb9af7"), green: hex("#9ece6a") },
  scrollbar: { track: hex("#1e2030"), thumb: hex("#3b4261"), thumbHover: hex("#565f89") },
  grid: hex("#292e42"),
};

const vesper: ThemePalette = {
  name: "Vesper",
  id: "vesper",
  bg: { base: hex("#101010"), surface: hex("#181818"), elevated: hex("#1e1e1e"), hover: hex("#262626") },
  border: { default: hex("#2a2a2a"), light: hex("#383838"), focus: hex("#ffc799") },
  text: { primary: hex("#d4d4d4"), secondary: hex("#a1a1a1"), muted: hex("#858585"), disabled: hex("#737373") },
  accent: { cyan: hex("#7dccaa"), amber: hex("#ffc799"), red: hex("#f5a191"), blue: hex("#8eb8e8"), purple: hex("#d4a4eb"), green: hex("#7dccaa") },
  scrollbar: { track: hex("#181818"), thumb: hex("#383838"), thumbHover: hex("#505050") },
  grid: hex("#222222"),
};

// ─── Exports ─────────────────────────────────────────────────────

export const themes: ThemePalette[] = [
  iot1,
  iot2,
  aura,
  ayu,
  carbonfox,
  catppuccin,
  dracula,
  gruvbox,
  monokai,
  nightOwl,
  nord,
  oneDarkPro,
  shadesOfPurple,
  solarized,
  tokyonight,
  vesper,
];

export const DEFAULT_THEME_ID = "iot-1";

export function getThemeById(id: string): ThemePalette {
  return themes.find((t) => t.id === id) ?? iot1;
}
