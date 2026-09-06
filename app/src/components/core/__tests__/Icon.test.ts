import * as lucide from 'lucide-react-native';
import { ICON_NAMES, ICONS } from '../Icon';

describe('Icon', () => {
  it('every name in the union is an export of the installed lucide-react-native', () => {
    // lucide icons are forwardRef objects, not plain functions.
    const isComponent = (v: unknown) => typeof v === 'function' || (typeof v === 'object' && v !== null);
    const missing = ICON_NAMES.filter((name) => !isComponent((lucide as Record<string, unknown>)[name]));
    expect(missing).toEqual([]);
  });

  it('maps each name to the lucide component of the same name (no silent aliases)', () => {
    for (const name of ICON_NAMES) {
      expect(ICONS[name]).toBe((lucide as Record<string, unknown>)[name]);
    }
  });

  it('covers the whole design-bundle icon set', () => {
    // The set only ever grows: each component wave adds the glyphs its screens
    // need (JoinCodeBlock brought `Copy`). Assert the floor and the absence of
    // duplicates rather than an exact count, which every wave would have to bump.
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(70);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(ICON_NAMES).toContain('Copy');
    expect(ICON_NAMES).toContain('VenetianMask');
    expect(ICON_NAMES).toContain('MessageSquareLock');
    expect(ICON_NAMES).toContain('Search');
  });
});
