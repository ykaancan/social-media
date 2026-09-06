import en from '../en.json';
import tr from '../tr.json';

type Leaf = string | string[];
type Json = { [k: string]: Leaf | Json };

function flatten(obj: Json, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v as Json, key));
    else out.push(key);
  }
  return out.sort();
}

describe('i18n tables', () => {
  const enKeys = flatten(en as unknown as Json);
  const trKeys = flatten(tr as unknown as Json);

  it('en and tr have identical key sets', () => {
    expect(trKeys).toEqual(enKeys);
  });

  it('is not empty', () => {
    expect(enKeys.length).toBeGreaterThan(50);
  });

  it('uses the same {n}-style placeholders in both tables', () => {
    const placeholders = (o: Json, prefix = ''): Record<string, string[]> => {
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(o)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, placeholders(v as Json, key));
        else {
          const found = String(v).match(/\{[a-zA-Z0-9_]+\}/g);
          if (found) out[key] = found.sort();
        }
      }
      return out;
    };
    const a = placeholders(en as unknown as Json);
    const b = placeholders(tr as unknown as Json);
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for (const key of Object.keys(a)) expect(b[key]).toEqual(a[key]);
  });
});
