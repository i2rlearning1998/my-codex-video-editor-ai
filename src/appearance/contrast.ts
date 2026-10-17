type RGB = readonly [number, number, number];
function parse(value: string): readonly [number, number, number, number] {
  if (/^#[\da-f]{6}$/i.test(value))
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16),
      1,
    ];
  const match =
    /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/.exec(
      value,
    );
  if (!match) throw Error('Expected hex RGB or rgba colour');
  const r = Number(match[1]),
    g = Number(match[2]),
    b = Number(match[3]),
    a = Number(match[4]);
  if (Math.max(r, g, b) > 255) throw Error('Invalid colour');
  return [r, g, b, a];
}
function over(value: string, base: RGB): RGB {
  const [r, g, b, a] = parse(value);
  return [
    r * a + base[0] * (1 - a),
    g * a + base[1] * (1 - a),
    b * a + base[2] * (1 - a),
  ];
}
function luminance(rgb: RGB): number {
  const linear = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
/** WCAG sRGB contrast; translucent backgrounds composite over the given panel. */
export function contrastRatio(
  foreground: string,
  background: string,
  panel = '#ffffff',
): number {
  const base = over(panel, [255, 255, 255]),
    bg = over(background, base),
    fg = over(foreground, bg),
    a = luminance(fg),
    b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
