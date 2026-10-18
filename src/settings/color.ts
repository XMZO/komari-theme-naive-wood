export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)
}

function toRgb(hex: string): [number, number, number] {
  const raw = hex.slice(1)
  const full = raw.length === 3 ? [...raw].map(char => char + char).join('') : raw
  return [0, 2, 4].map(index => Number.parseInt(full.slice(index, index + 2), 16)) as [number, number, number]
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  if (max === min) {
    return [0, 0, lightness]
  }
  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  hue /= 6
  return [hue, saturation, lightness]
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation === 0) {
    return [lightness * 255, lightness * 255, lightness * 255]
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const channel = (offset: number) => {
    let t = hue + offset
    if (t < 0)
      t += 1
    if (t > 1)
      t -= 1
    if (t < 1 / 6)
      return p + (q - p) * 6 * t
    if (t < 1 / 2)
      return q
    if (t < 2 / 3)
      return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [channel(1 / 3) * 255, channel(0) * 255, channel(-1 / 3) * 255]
}

function shiftLightness(hex: string, amount: number): string {
  const [hue, saturation, lightness] = rgbToHsl(...toRgb(hex))
  const next = Math.min(1, Math.max(0, lightness + amount))
  return toHex(...hslToRgb(hue, saturation, next))
}

/** 由主色推导按钮的悬停色与按下色：悬停略亮，按下略暗 */
export function derivePrimaryStates(primary: string): { hover: string, pressed: string } {
  return {
    hover: shiftLightness(primary, 0.06),
    pressed: shiftLightness(primary, -0.08),
  }
}
