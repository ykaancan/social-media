/**
 * Test helper (not a suite): reads the rotation off a rendered SVG hatch.
 *
 * `<Pattern>` drops `testID`, so the node is found by type. RNSVG lowers
 * `patternTransform="rotate(a)"` to the matrix [cos a, sin a, -sin a, cos a, 0, 0].
 */
type Node = { type?: string; props?: { matrix?: number[] }; children?: unknown[] | null };

/** Degrees, clockwise, of the first `<Pattern>` in a rendered tree. */
export function hatchRotation(tree: unknown): number {
  const find = (n: unknown): Node | null => {
    if (!n || typeof n !== 'object') return null;
    if (Array.isArray(n)) {
      for (const c of n) {
        const hit = find(c);
        if (hit) return hit;
      }
      return null;
    }
    const node = n as Node;
    if (node.type === 'RNSVGPattern') return node;
    return find(node.children ?? null);
  };
  const [cos = 1, sin = 0] = find(tree)?.props?.matrix ?? [];
  return Math.round((Math.atan2(sin, cos) * 180) / Math.PI);
}
