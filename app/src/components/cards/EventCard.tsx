import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useLocale, useTranslation, type Locale } from '../../i18n';
import {
  covers,
  EventColorProvider,
  ink,
  useMotion,
  useTheme,
  type CoverName,
} from '../../theme';
import { upper } from '../../utils/text';
import { StatusPill } from '../core/StatusPill';
import { Icon } from '../core/Icon';
import { Text } from '../core/Text';

export type EventStatus = 'live' | 'upcoming' | 'archived';

export interface EventCardProps {
  name: string;
  status?: EventStatus;
  /** Defaults to the app locale. Switches month, status label and casing together. */
  locale?: Locale;
  /** A cover name, or an explicit `{cover, soft}` pair. Defaults to magenta. */
  cover?: CoverName | { cover: string; soft: string };
  /** Start day, as shown ("03", "14"). */
  day?: string | number;
  /** 1–12 localises through `dates.monthsShort`; a string is passed through. */
  month?: number | string;
  dayEnd?: string | number;
  monthEnd?: number | string;
  timeRange?: string;
  /** Localise this yourself — the card does not know your section names. */
  scope?: string;
  memberCount?: number;
  postCount?: number;
  compact?: boolean;
  onPress?: () => void;
  labels?: { live?: string; upcoming?: string; archived?: string };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The decorative disc bottom-right. */
const DOT = 120;

/**
 * The event tile. Live is the full cover colour, upcoming is white with a
 * cover-tinted date block, archived is muted and desaturated.
 *
 * [HANDOFF §7 DD] Month abbreviations and status labels come from the i18n
 * tables ONLY (`dates.monthsShort`, `status.*`). The web component's
 * `EVENT_MONTHS` / `EVENT_LABELS` are deliberately NOT re-declared here — two
 * sources for the same strings is exactly the drift that note warns about.
 */
export function EventCard({
  name,
  status = 'upcoming',
  locale,
  cover = 'magenta',
  day,
  month,
  dayEnd,
  monthEnd,
  timeRange,
  scope,
  memberCount,
  postCount,
  compact = false,
  onPress,
  labels = {},
  style,
  testID,
}: EventCardProps) {
  const { colors, radius, space } = useTheme();
  const { dur, easing, reduced } = useMotion();
  const { t } = useTranslation();
  const appLocale = useLocale();
  const lng = locale ?? appLocale;

  const resolved = resolveCover(cover);

  const months = t('dates.monthsShort', { lng, returnObjects: true }) as unknown as string[];
  const monthName = (m: number | string | undefined): string | undefined =>
    typeof m === 'number' ? months[m - 1] : m;

  const m1 = monthName(month);
  const m2 = monthName(monthEnd);
  const range = dayEnd != null;
  const crossMonth = Boolean(range && m2 && m2 !== m1);

  // 14–16 over NOV · 30 Nov–2 Dec (cross-month moves the months onto the day line)
  const dayText = range ? (crossMonth ? `${day} ${m1}–${dayEnd} ${m2}` : `${day}–${dayEnd}`) : day;
  const monText = crossMonth ? null : m1;

  const label = labels[status] ?? (t(`status.${status}`, { lng }) as string);

  const live = status === 'live';
  const archived = status === 'archived';

  const shell: ViewStyle = live
    ? { backgroundColor: resolved.cover }
    : archived
      ? { backgroundColor: colors.surfaceMuted }
      : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border };

  // `box-shadow: inset 0 0 0 1px var(--border)` — an RN border is inside the
  // box too, so the padding drops 16 -> 15 on the ringed (upcoming) variant and
  // edge-to-content stays 16px in all three states.
  const pad = live || archived ? space.cardPad : space.cardPad - 1;

  const foreground = live ? resolved.onCover : archived ? colors.text2 : colors.text;

  const dateBlock: ViewStyle = live
    ? { backgroundColor: 'rgba(11, 11, 11, 0.12)' }
    : archived
      ? { backgroundColor: ink[100] }
      : { backgroundColor: resolved.soft };
  const dateColor = live ? resolved.onCover : archived ? colors.text2 : colors.text;

  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const metaItems: { icon: 'MapPin' | 'Clock' | 'Users' | 'MessageSquare'; value: string }[] = [];
  if (scope) metaItems.push({ icon: 'MapPin', value: scope });
  if (timeRange) metaItems.push({ icon: 'Clock', value: timeRange });
  if (memberCount != null) metaItems.push({ icon: 'Users', value: String(memberCount) });
  if (postCount != null) metaItems.push({ icon: 'MessageSquare', value: String(postCount) });

  return (
    // Every nested component (chips, buttons, the composer preview) reads the
    // event colour from context; the card is where that context starts.
    <EventColorProvider cover={cover}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${label}`}
        onPress={onPress}
        onPressIn={() => {
          // .c-ev:active { transform: scale(.985) } — its own value.
          scale.value = withTiming(reduced ? 1 : 0.985, { duration: dur.fast, easing: easing.out });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: dur.fast, easing: easing.out });
        }}
      >
        <Animated.View
          style={[styles.root, { borderRadius: radius.card, padding: pad }, shell, animated, style]}
        >
          {!live ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.dot,
                // `filter: grayscale(1)` has no RN equivalent; the archived disc
                // is drawn in neutral ink at the same .08 opacity instead.
                archived
                  ? { backgroundColor: ink[500], opacity: 0.08 }
                  : { backgroundColor: resolved.cover, opacity: 0.18 },
              ]}
            />
          ) : null}

          <View style={styles.top}>
            <View
              style={[
                styles.date,
                { borderRadius: radius.md },
                dateBlock,
                range ? styles.dateRange : null,
              ]}
            >
              <Text
                variant={range ? 'displaySm' : 'displayMd'}
                color={dateColor}
                nums
                numberOfLines={1}
                style={range ? styles.day24 : styles.day32}
              >
                {dayText}
              </Text>
              {monText ? (
                <Text variant="captionCaps" color={dateColor} numberOfLines={1}>
                  {upper(monText, lng)}
                </Text>
              ) : null}
            </View>
            <StatusPill status={status} label={label} locale={lng} />
          </View>

          {/* `lang={locale}` in the web makes text-transform follow the CARD's
              locale, not the app's, so the uppercase runs through the
              Turkish-aware helper with `lng` rather than <Text upper>. */}
          <Text variant={compact ? 'displayMd' : 'displayLg'} color={foreground}>
            {upper(name, lng)}
          </Text>

          {metaItems.length ? (
            <View style={styles.meta}>
              {metaItems.map((m) => (
                <View key={m.icon} style={styles.metaItem}>
                  <Icon name={m.icon} size={14} strokeWidth={2.25} color={foreground} />
                  <Text variant="bodySmStrong" color={foreground} nums numberOfLines={1}>
                    {m.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>
      </Pressable>
    </EventColorProvider>
  );
}

/** `covers[name]` or the explicit pair; `onCover` is a constant in both schemes. */
function resolveCover(value: CoverName | { cover: string; soft: string }) {
  // Deliberately duplicated from EventColorProvider's private resolver: the
  // card needs the colours for its own shell BEFORE the provider is mounted.
  const onCover = ink[950];
  return typeof value === 'string' ? { ...covers[value], onCover } : { ...value, onCover };
}

const styles = StyleSheet.create({
  root: { flexDirection: 'column', gap: 14, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  date: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
    height: 56,
    flexGrow: 0,
    flexShrink: 0,
  },
  dateRange: { paddingHorizontal: 10 },
  // .c-ev__day { line-height: 1 } at --display-md (32) and --display-sm (24)
  day32: { lineHeight: 32 },
  day24: { lineHeight: 24 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', opacity: 0.85 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: {
    position: 'absolute',
    right: -30,
    bottom: -30,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    pointerEvents: 'none',
  },
});
