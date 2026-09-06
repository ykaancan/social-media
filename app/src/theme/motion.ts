import {
  Easing,
  useReducedMotion,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';

/** tokens/motion.css durations, in ms. */
export interface Durations {
  fast: number;
  base: number;
  slow: number;
  /** the live pulse; never zeroed by reduced motion */
  pulse: number;
  projectorIn: number;
}

export const duration: Durations = {
  fast: 120,
  base: 200,
  slow: 320,
  /** the live pulse; deliberately NOT zeroed by reduced motion */
  pulse: 1600,
  /** @keyframes projector-in runs at 600ms */
  projectorIn: 600,
};

export type Duration = Durations;

/** tokens/motion.css easings. */
export const easing = {
  out: Easing.bezier(0.2, 0.8, 0.2, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  pop: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

/** --press-scale */
export const pressScale = 0.97;

/** Alpha of the live-pulse ring at the start of each cycle. */
export const pulseAlpha = 0.55;

/**
 * Reduced-motion aware durations.
 *
 * The CSS media query zeroes --dur-fast/base/slow only; --dur-pulse is left
 * alone on purpose, because the live dot is a *status indicator*, not
 * decoration — with the pulse gone there is nothing to say a board is live.
 */
export function useMotion(): { dur: Duration; easing: typeof easing; pressScale: number; reduced: boolean } {
  const reduced = useReducedMotion();
  const dur: Duration = reduced
    ? { ...duration, fast: 0, base: 0, slow: 0, projectorIn: 0 }
    : duration;
  return { dur, easing, pressScale: reduced ? 1 : pressScale, reduced };
}

const timing = (d: number, e = easing.out): WithTimingConfig => ({ duration: d, easing: e });

/* ------------------------------------------------------------------ *
 * Keyframe recipes.
 *
 * Each helper returns the value an animated style property should animate
 * to/through. They are worklet-safe (only reanimated primitives inside), so
 * they can be called from `useAnimatedStyle`.
 * ------------------------------------------------------------------ */

/**
 * @keyframes post-in — from { opacity:0; translateY(-14px) scale(.98) }
 * A new post dropping into the board feed. Drive it from an entering shared
 * value: `progress.value = withTiming(1, timingBase)`, then interpolate
 * opacity 0->1, translateY -14->0, scale 0.98->1.
 */
export const postIn = {
  from: { opacity: 0, translateY: -14, scale: 0.98 },
  to: { opacity: 1, translateY: 0, scale: 1 },
  config: (d: number = duration.base) => timing(d),
} as const;

/**
 * @keyframes react-burst — 1 -> 1.45 (rotate -8deg) -> 1.
 * Apply to the reaction glyph's scale (and rotate) shared values.
 */
export function reactBurst(d: number = duration.slow) {
  'worklet';
  return withSequence(
    withTiming(1.45, timing(Math.round(d * 0.35), easing.pop)),
    withTiming(1, timing(Math.round(d * 0.65), easing.out))
  );
}

export function reactBurstRotate(d: number = duration.slow) {
  'worklet';
  return withSequence(
    withTiming(-8, timing(Math.round(d * 0.35), easing.pop)),
    withTiming(0, timing(Math.round(d * 0.65), easing.out))
  );
}

/**
 * @keyframes count-bump — translateY 0 -> -4 -> 0.
 * Apply to a badge/count's translateY shared value when the number changes.
 */
export function countBump(d: number = duration.base) {
  'worklet';
  return withSequence(
    withTiming(-4, timing(Math.round(d * 0.4), easing.out)),
    withTiming(0, timing(Math.round(d * 0.6), easing.out))
  );
}

/**
 * @keyframes projector-in — from { opacity:0; translateY(40px) }, 600ms.
 * The one animation projector mode gets; it is the entrance of each post.
 */
export const projectorIn = {
  from: { opacity: 0, translateY: 40 },
  to: { opacity: 1, translateY: 0 },
  config: (d: number = duration.projectorIn) => timing(d, easing.out),
} as const;

/**
 * @keyframes live-pulse — an expanding ring that fades out, looping forever.
 *
 * RN has no box-shadow keyframes, so the recipe is: render a sibling ring
 * <View> behind the dot, absolutely positioned and matching its size, with
 * `backgroundColor: withAlpha(color, pulseAlpha)`. Animate the ring's scale
 * 1 -> 2.6 and opacity 1 -> 0 over `duration.pulse`, repeating forever.
 *
 * `color` is a parameter so the amber "waiting for approval" dot can reuse it.
 */
export const livePulseRing = {
  scaleTo: 2.6,
  alpha: pulseAlpha,
  /** 0 -> 70% of the cycle expands, the rest is dead time before the next ring */
  activeFraction: 0.7,
};

export function livePulseScale(d: number = duration.pulse) {
  'worklet';
  return withRepeat(
    withSequence(
      withTiming(livePulseRing.scaleTo, timing(Math.round(d * livePulseRing.activeFraction), easing.out)),
      withTiming(1, { duration: 0 }),
      withDelay(Math.round(d * (1 - livePulseRing.activeFraction)), withTiming(1, { duration: 0 }))
    ),
    -1,
    false
  );
}

export function livePulseOpacity(d: number = duration.pulse) {
  'worklet';
  return withRepeat(
    withSequence(
      withTiming(0, timing(Math.round(d * livePulseRing.activeFraction), easing.out)),
      withTiming(1, { duration: 0 }),
      withDelay(Math.round(d * (1 - livePulseRing.activeFraction)), withTiming(1, { duration: 0 }))
    ),
    -1,
    false
  );
}

export const motion = { duration, easing, pressScale, pulseAlpha } as const;
