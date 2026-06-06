export const uiColors = {
  brand: "#111111",
  brandHover: "#27272a",
  border: "#e4e4e7",
  text: "#18181b",
  textMuted: "#52525b",
  surface: "#ffffff",
  surfaceSoft: "#fafafa",
} as const

export type UiColorName = keyof typeof uiColors
