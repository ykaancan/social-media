import { formatHex, parse, toGamut } from 'culori';
import { anonHint, avatarTints, coverNames, covers, status } from '../colors.generated';

const HEX = /^#[0-9a-f]{6}$/;

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe('colors.generated', () => {
  it('round-trips an in-gamut oklch to within 1/255 per channel', () => {
    // oklch(0.95 0.04 350) is inside sRGB, so gamut mapping is a no-op and the
    // generated hex must equal a direct conversion.
    const direct = formatHex(parse('oklch(0.95 0.04 350)')!)!;
    const generated = covers.magenta.soft;
    const a = channels(direct);
    const b = channels(generated);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(1);
    }
  });

  it('gamut-maps the out-of-gamut lime cover to a valid sRGB hex', () => {
    // oklch(0.78 0.19 130) is outside sRGB; the value must still be a plain hex
    // and must match CSS Color 4 chroma-reduction (what Chrome renders).
    expect(covers.lime.cover).toMatch(HEX);
    const mapped = formatHex(toGamut('rgb', 'oklch')(parse('oklch(0.78 0.19 130)')!));
    expect(covers.lime.cover).toBe(mapped);
  });

  it('emits a 6-digit hex for every token', () => {
    for (const name of coverNames) {
      expect(covers[name].cover).toMatch(HEX);
      expect(covers[name].soft).toMatch(HEX);
    }
    for (const v of Object.values(status)) expect(v).toMatch(HEX);
    for (const v of avatarTints) expect(v).toMatch(HEX);
    expect(anonHint.app.fg).toMatch(HEX);
    expect(anonHint.projector.bg).toMatch(HEX);
  });

  it('keeps the canonical cover order (avatarTints shares the indexes)', () => {
    expect(coverNames).toEqual([
      'magenta',
      'coral',
      'tangerine',
      'amber',
      'lime',
      'mint',
      'azure',
      'violet',
    ]);
    expect(avatarTints).toHaveLength(coverNames.length);
  });
});
