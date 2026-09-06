import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, FeGaussianBlur, Filter, Pattern, Rect } from 'react-native-svg';
import { useTranslation } from '../../i18n';
import { ink, useEntitlements, useTheme } from '../../theme';
import { AnonymityBadge, type AnonymityHints, type AnonymityLevel } from '../anonymity/AnonymityBadge';
import { Button } from '../core/Button';
import { Icon } from '../core/Icon';
import { Text } from '../core/Text';
import { PostCard } from './PostCard';

export interface LockedCardProps {
  level?: AnonymityLevel;
  hints?: AnonymityHints;
  /**
   * The REAL character count. Defaults to `text.length`, else 120.
   *
   * A locked-only input: it is what the blurred bars stand for. In stage 1 the
   * server always delivers `text`, so `length` on its own is never the whole
   * story of a card — see the gate-OFF note on the component below.
   */
  length?: number;
  text?: string;
  unlocked?: boolean;
  children?: React.ReactNode;
  time?: string;
  source?: string;
  onUnlock?: () => void;
  labels?: {
    unlock?: string;
    chars?: string;
    fromSomeoneAt?: string;
    locked?: string;
    anonymous?: string;
    hint?: string;
  };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Characters the blurred bars stand in for, per line. */
const PER_LINE = 42;
/** The hatch: a 12px period of transparent with one 2px stroke, rotated 135°. */
const HATCH_PERIOD = 12;
const HATCH_STROKE = 2;
const BAR_HEIGHT = 11;
const BAR_GAP = 10;
const BAR_RADIUS = 6;
/** --ink-400 at 42% */
const BAR_OPACITY = 0.42;

/**
 * The honesty maths from `LockedCard.jsx`, verbatim: the blurred bars stand for
 * the message's REAL character count, so a locked card never over- or
 * under-sells what is behind it. Every line is full width except the last.
 *
 * @returns line widths as percentages, 1–6 entries.
 */
export function lockedLineWidths(length: number): number[] {
  const n = Math.max(1, Math.min(6, Math.ceil(length / PER_LINE)));
  return Array.from({ length: n }, (_, i) =>
    i < n - 1 ? 100 : Math.max(18, Math.round((((length % PER_LINE) || PER_LINE) / PER_LINE) * 100))
  );
}

/**
 * background-image: var(--locked-hatch) — 135deg, 10px gap + 2px line, period 12.
 *
 * RULE: a CSS `repeating-linear-gradient(θ, …)` lays its stripes PERPENDICULAR
 * to θ — θ is the direction the colour ramp travels, not the direction the bands
 * run. This pattern draws VERTICAL bands, so it has to be rotated by `θ − 90`
 * (equivalently `θ + 90`) to land on the same stripes. Here 135 − 90 = 45, which
 * runs the stripes bottom-left to top-right ("/"), exactly as the web does.
 */
function Hatch({ stroke }: { stroke: string }) {
  return (
    <Svg style={[StyleSheet.absoluteFill, styles.noPointer]}>
      <Defs>
        <Pattern
          id="lockedcard-hatch"
          x={0}
          y={0}
          width={HATCH_PERIOD}
          height={HATCH_PERIOD}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <Rect x={0} y={0} width={HATCH_STROKE} height={HATCH_PERIOD} fill={stroke} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#lockedcard-hatch)" />
    </Svg>
  );
}

/**
 * .c-lock__lines — `filter: blur(var(--locked-blur))` has no RN style
 * equivalent, so the bars are drawn as SVG rects behind an SVG gaussian blur.
 * `stdDeviation` is half the CSS blur radius, which is the CSS filter spec's
 * own definition of `blur(r)`.
 *
 * The canvas is inflated by `pad` on every side so the blur is never clipped,
 * which is exactly why the bar widths cannot be SVG percentages: a percentage
 * resolves against the PADDED canvas, so a `100%` bar would overrun the card by
 * `2 * pad`. The content width is measured with `onLayout` and the honesty
 * percentages are turned into px against it, so a 100% bar spans the content
 * width and nothing else.
 */
function Bars({ widths, blur, testID }: { widths: number[]; blur: number; testID?: string }) {
  const height = widths.length * BAR_HEIGHT + (widths.length - 1) * BAR_GAP;
  // The blur bleeds past the bars; pad the canvas so nothing is clipped.
  const pad = blur * 2;

  // `styles.lines` has no horizontal padding, so this View's width IS the
  // content width the bars have to measure against.
  const [contentWidth, setContentWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContentWidth(e.nativeEvent.layout.width);
  }, []);

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={styles.lines}
    >
      <View style={{ height }}>
        {contentWidth > 0 ? (
          <Svg
            width={contentWidth + pad * 2}
            height={height + pad * 2}
            style={[styles.canvas, { left: -pad, top: -pad }, styles.noPointer]}
          >
            <Defs>
              <Filter id="lockedcard-blur" x="-20%" y="-20%" width="140%" height="140%">
                <FeGaussianBlur stdDeviation={blur / 2} />
              </Filter>
            </Defs>
            {widths.map((w, i) => (
              <Rect
                key={i}
                testID={testID ? `${testID}-${i}` : undefined}
                x={pad}
                y={pad + i * (BAR_HEIGHT + BAR_GAP)}
                width={(w / 100) * contentWidth}
                height={BAR_HEIGHT}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
                fill={ink[400]}
                opacity={BAR_OPACITY}
                filter="url(#lockedcard-blur)"
              />
            ))}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

/**
 * An inbox message beyond the free-read limit. The content is hidden; every
 * piece of metadata — level, character count, time, source — is REAL.
 *
 * **[D3] Stage 1 renders this as an ordinary card.** `useEntitlements()
 * .lockedCards` is the server-side gate and defaults to OFF; while it is off
 * this component renders a plain `PostCard` — no hatch, no dashed border, no
 * blurred bars, no lock badge, no Unlock button — because nothing in stage 1
 * may look different for a reason the user cannot see. The locked treatment
 * below is built and tested so it appears the day the flag flips.
 *
 * **`text` vs `length`.** In stage 1 the server always delivers `text`: the gate
 * is off, so there is nothing to withhold. `length` alone is a LOCKED-only
 * input — it is what the blurred bars stand for while the content is hidden.
 * A gate-OFF card built from `length` with no `text` would therefore be a bug
 * in the caller, but it must never render as a blank card: the header and the
 * real meta line (`{length} characters · from someone at {source}`) become the
 * body instead, so every card still says something true. Nothing is invented —
 * the meta line is the same real metadata the locked card shows (principle 4).
 */
export function LockedCard({
  level = 'anonymous',
  hints,
  length,
  text,
  unlocked = false,
  children,
  time,
  source,
  onUnlock,
  labels = {},
  style,
  testID,
}: LockedCardProps) {
  const { colors, radius, space } = useTheme();
  const { t } = useTranslation();
  const { lockedCards } = useEntitlements();

  const chars = length ?? (text ? text.length : 120);

  const L = {
    unlock: labels.unlock ?? (t('inbox.unlock') as string),
    chars: labels.chars ?? (t('inbox.chars') as string),
    fromSomeoneAt: labels.fromSomeoneAt ?? (t('inbox.fromSomeoneAt') as string),
    locked: labels.locked ?? (t('inbox.locked') as string),
  };

  // The real metadata, as one line. Stands in for a missing body; it is also
  // exactly what the locked card's meta row says, word for word.
  const metaLine = source
    ? `${chars} ${L.chars} · ${L.fromSomeoneAt} ${source}`
    : `${chars} ${L.chars}`;

  // [D3] Gate OFF — an ordinary card, indistinguishable from any other.
  if (!lockedCards) {
    return (
      <PostCard
        testID={testID}
        // Never an empty body: without `text` the meta line IS the body.
        text={text ?? metaLine}
        sender={{ level, hints }}
        time={time}
        source={source}
        labels={{ anonymous: labels.anonymous, hint: labels.hint }}
        style={style}
      >
        {children}
      </PostCard>
    );
  }

  const locked = !unlocked;

  return (
    <View
      testID={testID}
      accessibilityLabel={locked ? L.locked : undefined}
      style={[
        styles.root,
        {
          backgroundColor: colors.lockedBg,
          borderColor: colors.lockedBorder,
          borderRadius: radius.card,
          padding: space.cardPad,
        },
        style,
      ]}
    >
      <Hatch stroke={colors.lockedHatchStroke} />

      <View
        style={[
          styles.badge,
          {
            backgroundColor: unlocked ? ink[700] : ink[900],
            // box-shadow: 0 0 0 4px var(--locked-bg) is an OUTER ring; an RN
            // border is inside the box, so the circle grows to 40px with a 4px
            // locked-bg border and is nudged 4px out to keep the 32px of ink
            // exactly where the web puts it.
            borderColor: colors.lockedBg,
          },
        ]}
      >
        <Icon name={unlocked ? 'LockOpen' : 'Lock'} size={16} strokeWidth={2.5} color={ink[0]} />
      </View>

      <View style={styles.header}>
        <AnonymityBadge
          level={level}
          hints={hints}
          labels={{ anonymous: labels.anonymous, hint: labels.hint }}
          showLevel
        />
        {time ? (
          <Text variant="caption" color={colors.text3} nums numberOfLines={1} style={styles.time}>
            {time}
          </Text>
        ) : null}
      </View>

      {unlocked && text ? (
        <Text variant="post" color={colors.text}>
          {text}
        </Text>
      ) : (
        <Bars
          widths={lockedLineWidths(chars)}
          blur={colors.lockedBlur}
          testID={testID ? `${testID}-bars` : 'locked-card-bars'}
        />
      )}

      <View style={styles.meta}>
        <Text variant="bodySm" color={colors.text2}>
          <Text variant="bodySmStrong" color={colors.text} nums>
            {chars}
          </Text>
          {` ${L.chars}`}
        </Text>
        {source ? (
          <>
            <Text variant="bodySm" color={colors.text2} accessibilityElementsHidden>
              ·
            </Text>
            <Text variant="bodySm" color={colors.text2}>
              {`${L.fromSomeoneAt} `}
              <Text variant="bodySmStrong" color={colors.text}>
                {source}
              </Text>
            </Text>
          </>
        ) : null}
      </View>

      {children}

      {locked ? (
        <Button
          variant="secondary"
          icon="LockOpen"
          full
          onPress={onUnlock}
          testID={testID ? `${testID}-unlock` : undefined}
        >
          {L.unlock}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'column',
    gap: 12,
    // `1.5px dashed var(--locked-border)`
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
    flexGrow: 0,
    flexShrink: 0,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // .c-lock__hd .c-lock__time { margin-right: 40px } — clears the badge circle.
  time: { marginRight: 40, flexGrow: 0, flexShrink: 0 },
  // .c-lock__lines { padding: 6px 0 4px }
  lines: { paddingTop: 6, paddingBottom: 4, pointerEvents: 'none' },
  // Absolute so the padded canvas never widens the card; `left`/`top` pull the
  // padding back off the content box.
  canvas: { position: 'absolute' },
  noPointer: { pointerEvents: 'none' },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  badge: {
    position: 'absolute',
    top: 12 - 4,
    right: 12 - 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
