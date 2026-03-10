import { create } from "zustand";
import {
  type ThemePalette,
  getThemeById,
  DEFAULT_THEME_ID,
} from "@/themes/index";

const THEME_STORAGE_KEY = "iotui_theme_v1";

// ─── CSS variable injection ──────────────────────────────────────

/** Apply a theme palette by setting CSS custom properties on :root. */
function applyThemeToDOM(palette: ThemePalette): void {
  const s = document.documentElement.style;

  // Backgrounds
  s.setProperty("--iot-bg-base", palette.bg.base);
  s.setProperty("--iot-bg-surface", palette.bg.surface);
  s.setProperty("--iot-bg-elevated", palette.bg.elevated);
  s.setProperty("--iot-bg-hover", palette.bg.hover);

  // Borders
  s.setProperty("--iot-border", palette.border.default);
  s.setProperty("--iot-border-light", palette.border.light);
  s.setProperty("--iot-border-focus", palette.border.focus);

  // Text
  s.setProperty("--iot-text-primary", palette.text.primary);
  s.setProperty("--iot-text-secondary", palette.text.secondary);
  s.setProperty("--iot-text-muted", palette.text.muted);
  s.setProperty("--iot-text-disabled", palette.text.disabled);

  // Accent colours
  s.setProperty("--iot-cyan", palette.accent.cyan);
  s.setProperty("--iot-amber", palette.accent.amber);
  s.setProperty("--iot-red", palette.accent.red);
  s.setProperty("--iot-blue", palette.accent.blue);
  s.setProperty("--iot-purple", palette.accent.purple);
  s.setProperty("--iot-green", palette.accent.green);

  // Scrollbar
  s.setProperty("--iot-scrollbar-track", palette.scrollbar.track);
  s.setProperty("--iot-scrollbar-thumb", palette.scrollbar.thumb);
  s.setProperty("--iot-scrollbar-thumb-hover", palette.scrollbar.thumbHover);

  // Grid pattern
  s.setProperty("--iot-grid", palette.grid);
}

// ─── Persistence helpers ─────────────────────────────────────────

function loadThemeId(): string {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function persistThemeId(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // storage full or unavailable – silently ignore
  }
}

// ─── Store ───────────────────────────────────────────────────────

interface ThemeStore {
  themeId: string;
  palette: ThemePalette;
  setTheme: (id: string) => void;
  /** Temporarily apply a theme to the DOM without persisting (for live preview). */
  previewTheme: (id: string) => void;
  /** Revert DOM to the committed theme (cancels preview). */
  revertPreview: () => void;
  /** Call once on app mount to push the persisted theme into the DOM. */
  hydrate: () => void;
}

const initialId = loadThemeId();
const initialPalette = getThemeById(initialId);

export const useThemeStore = create<ThemeStore>((set) => ({
  themeId: initialId,
  palette: initialPalette,

  setTheme: (id: string) => {
    const palette = getThemeById(id);
    applyThemeToDOM(palette);
    persistThemeId(id);
    set({ themeId: id, palette });
  },

  previewTheme: (id: string) => {
    const palette = getThemeById(id);
    applyThemeToDOM(palette);
    // Don't persist – this is a temporary preview
  },

  revertPreview: () => {
    const { palette } = useThemeStore.getState();
    applyThemeToDOM(palette);
  },

  hydrate: () => {
    const id = loadThemeId();
    const palette = getThemeById(id);
    applyThemeToDOM(palette);
    set({ themeId: id, palette });
  },
}));

// ─── Non-React accessor (for canvas / SVG utilities) ─────────────

export function getActiveThemePalette(): ThemePalette {
  return useThemeStore.getState().palette;
}
