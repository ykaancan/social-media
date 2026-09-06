import { avatarTints } from '../../../theme';
import { initialFor, tintFor, tintIndexFor } from '../Avatar';

describe('Avatar tint', () => {
  it('is stable for a given name', () => {
    const a = tintIndexFor('Şeyma Kaya');
    expect(tintIndexFor('Şeyma Kaya')).toBe(a);
    expect(tintIndexFor('Şeyma Kaya')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(avatarTints.length);
    expect(tintFor('Şeyma Kaya')).toBe(avatarTints[a]);
  });

  it('matches the web hash (h = h * 31 + code, unsigned)', () => {
    const reference = (name: string) => {
      let h = 0;
      for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return h % 8;
    };
    for (const name of ['Şeyma Kaya', 'irem', 'ırmak', 'Ali', '', 'Boğaziçi ESN']) {
      expect(tintIndexFor(name)).toBe(reference(name));
    }
  });

  it('gives different names different tints often enough to be useful', () => {
    const seen = new Set(['Ada', 'Berk', 'Ceren', 'Deniz', 'Ece', 'Furkan', 'Gizem', 'Hakan'].map(tintIndexFor));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('Avatar initial', () => {
  it('uppercases Turkish dotless i to plain I', () => {
    expect(initialFor('ırmak')).toBe('I');
  });

  it('uppercases Turkish dotted i to the dotted capital', () => {
    expect(initialFor('irem')).toBe('İ');
    expect(initialFor('irem')).not.toBe('I');
  });

  it('trims and handles an empty name', () => {
    expect(initialFor('  ada  ')).toBe('A');
    expect(initialFor('')).toBe('');
    expect(initialFor('   ')).toBe('');
  });
});
