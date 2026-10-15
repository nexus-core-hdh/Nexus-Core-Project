/** Bump to switch every user to the current default preset once (see app/layout.tsx). */
export const THEME_VERSION = "professional-1";

export type ThemeType = {
  /** A THEMES value; "default" is the Classic neutral theme. */
  preset: string;
  radius: string;
  scale: string;
  contentLayout: string;
};

export const DEFAULT_THEME: ThemeType = {
  preset: "professional",
  radius: "default",
  scale: "none",
  contentLayout: "full"
};

export const THEMES = [
  {
    name: "Professional",
    value: "professional",
    colors: ["oklch(0.546 0.2153 262.87)"]
  },
  {
    name: "Classic",
    value: "default",
    colors: ["oklch(0.33 0 0)"]
  },
  {
    name: "Underground",
    value: "underground",
    colors: ["oklch(0.5315 0.0694 156.19)"]
  },
  {
    name: "Rose Garden",
    value: "rose-garden",
    colors: ["oklch(0.5827 0.2418 12.23)"]
  },
  {
    name: "Lake View",
    value: "lake-view",
    colors: ["oklch(0.765 0.177 163.22)"]
  },
  {
    name: "Sunset Glow",
    value: "sunset-glow",
    colors: ["oklch(0.5827 0.2187 36.98)"]
  },
  {
    name: "Forest Whisper",
    value: "forest-whisper",
    colors: ["oklch(0.5276 0.1072 182.22)"]
  },
  {
    name: "Ocean Breeze",
    value: "ocean-breeze",
    colors: ["oklch(0.59 0.20 277.12)"]
  },
  {
    name: "Lavender Dream",
    value: "lavender-dream",
    colors: ["oklch(0.71 0.16 293.54)"]
  }
];
