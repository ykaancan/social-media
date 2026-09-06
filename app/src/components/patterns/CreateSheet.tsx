import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { t as translate, useLocale, useTranslation, type Locale } from '../../i18n';
import { covers, coverNames, ink, useTheme, type CoverName } from '../../theme';
import { EventCard, type EventCardProps } from '../cards';
import { Button } from '../core/Button';
import { Icon } from '../core/Icon';
import { Input } from '../core/Input';
import { Sheet } from '../core/Sheet';
import { Tabs } from '../core/Tabs';
import { Text } from '../core/Text';
import { useMonthsShort } from './JoinSheet';

/** event name — HANDOFF §4. */
export const EVENT_NAME_MAX = 40;

export type EventScope = 'section' | 'national';
export type BoardMode = 'approve_first' | 'post_immediately';

export interface EventDraftInput {
  name: string;
  scope: EventScope;
  start: Date;
  end: Date;
  cover: CoverName;
  mode: BoardMode;
  /** The creator's own section, shown when `scope === 'section'`. */
  mySection: string;
  /** Already-translated label for the national scope; defaults to i18n. */
  nationalLabel?: string;
  /** Weekday abbreviations for a multi-day range. */
  locale?: Locale;
  /** Fallback name while the field is empty, so the preview card is never blank.
   *  Defaults to i18n. */
  placeholderName?: string;
}

export interface EventDraft {
  name: string;
  status: 'upcoming';
  cover: CoverName;
  day: string;
  month: number;
  dayEnd?: string;
  monthEnd?: number;
  timeRange: string;
  scope: string;
  mode: BoardMode;
  start: Date;
  end: Date;
  /** `true` when the board spans more than one calendar day. */
  multiDay: boolean;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "20:00" */
export function clockOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The pure half of CreateSheet: a name, a scope, two dates, a cover and a mode
 * become the fields an `EventCard` renders.
 *
 * Rules are the prototype's, unchanged: a board is multi-day when the start and
 * end fall on different calendar days; `monthEnd` is only carried when the
 * months differ; a multi-day range shows weekday abbreviations, a single night
 * shows `HH:mm–HH:mm`. Every event has both a start and an end — [D4] gives the
 * board `status = 'live'` as its only writability condition, and the end time is
 * what closes it.
 */
export function buildEventDraft({
  name,
  scope,
  start,
  end,
  cover,
  mode,
  mySection,
  // `buildEventDraft` is pure and cannot hold a hook, so the defaults come from
  // the non-hook `t`. They are still i18n, still locale-live — never an English
  // string frozen into the source.
  nationalLabel = translate('events.national'),
  locale = 'en',
  placeholderName = translate('events.name'),
}: EventDraftInput): EventDraft {
  const multiDay = start.getDate() !== end.getDate() || start.getMonth() !== end.getMonth();
  const weekday = (d: Date): string => d.toLocaleDateString(locale, { weekday: 'short' });

  return {
    name: name.trim() || placeholderName,
    status: 'upcoming',
    cover,
    day: String(start.getDate()),
    month: start.getMonth() + 1,
    dayEnd: multiDay ? String(end.getDate()) : undefined,
    monthEnd: multiDay && end.getMonth() !== start.getMonth() ? end.getMonth() + 1 : undefined,
    timeRange: multiDay
      ? `${weekday(start)}–${weekday(end)}`
      : `${clockOf(start)}–${clockOf(end)}`,
    scope: scope === 'national' ? nationalLabel : mySection,
    mode,
    start,
    end,
    multiDay,
  };
}

export interface CreateSheetProps {
  me: { section: string };
  start: Date;
  end: Date;
  /** The screen owns the date/time picker and passes the chosen date back down. */
  onPickStart: () => void;
  onPickEnd: () => void;
  onClose: () => void;
  onCreate: (draft: EventDraft) => void;
}

/**
 * Create an event: name, scope, dates, cover colour, board mode, preview.
 *
 * The web uses two `<input type="datetime-local">` controls, which have no RN
 * equivalent. Starts/Ends are therefore pressable fields styled like the
 * prototype's `S.native`, and the screen supplies the actual picker through
 * `onPickStart` / `onPickEnd`.
 */
export function CreateSheet({
  me,
  start,
  end,
  onPickStart,
  onPickEnd,
  onClose,
  onCreate,
}: CreateSheetProps) {
  const { colors, radius } = useTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const months = useMonthsShort();

  const [name, setName] = useState('');
  const [scope, setScope] = useState<EventScope>('section');
  const [cover, setCover] = useState<CoverName>('coral');
  const [mode, setMode] = useState<BoardMode>('approve_first');

  const namedEnough = name.trim().length > 1;
  const valid = namedEnough && end.getTime() > start.getTime();

  const draft = buildEventDraft({
    name,
    scope,
    start,
    end,
    cover,
    mode,
    mySection: me.section,
    nationalLabel: t('events.national'),
    locale,
    placeholderName: t('events.name'),
  });

  const validity = !valid && namedEnough
    ? t('events.endAfterStart')
    : draft.multiDay
      ? t('events.multiDay')
      : t('events.oneNight');

  const fieldDate = (d: Date): string =>
    `${pad(d.getDate())} ${months[d.getMonth()] ?? ''} ${clockOf(d)}`.trim();

  const previewCard: EventCardProps = {
    name: draft.name,
    status: draft.status,
    cover: draft.cover,
    day: draft.day,
    month: draft.month,
    dayEnd: draft.dayEnd,
    monthEnd: draft.monthEnd,
    timeRange: draft.timeRange,
    scope: draft.scope,
  };

  return (
    <Sheet title={t('events.createTitle')} onClose={onClose} style={styles.sheet} testID="create-sheet">
      <Input
        label={t('events.name')}
        placeholder={t('events.namePlaceholder')}
        value={name}
        onChange={setName}
        maxLength={EVENT_NAME_MAX}
        autoFocus
        testID="create-name"
      />

      <View style={styles.block}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('events.scope')}
        </Text>
        <Tabs
          variant="segmented"
          value={scope}
          onChange={(id) => setScope(id as EventScope)}
          items={[
            { id: 'section', label: t('events.mySection', { name: me.section.replace('ESN ', '') }) },
            { id: 'national', label: t('events.national') },
          ]}
          testID="create-scope"
        />
      </View>

      <View style={styles.dates}>
        {(
          [
            { key: 'start', label: t('events.starts'), value: start, onPress: onPickStart },
            { key: 'end', label: t('events.endsLabel'), value: end, onPress: onPickEnd },
          ] as const
        ).map((f) => (
          <View key={f.key} style={styles.dateField}>
            <Text variant="bodySmStrong">{f.label}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${f.label} ${fieldDate(f.value)}`}
              testID={`create-${f.key}`}
              onPress={f.onPress}
              style={[
                styles.native,
                {
                  borderColor: colors.borderStrong,
                  borderRadius: radius.input,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <Text variant="body" nums numberOfLines={1}>
                {fieldDate(f.value)}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Text variant="caption" color={colors.text2}>
        {validity}
      </Text>

      <View style={styles.block}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('events.coverColor')}
        </Text>
        <View style={styles.swatches}>
          {coverNames.map((c) => {
            const selected = cover === c;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={c}
                accessibilityState={{ selected }}
                testID={`create-cover-${c}`}
                onPress={() => setCover(c)}
                // The web ring is `0 0 0 2px var(--bg), 0 0 0 4px var(--ink-900)`.
                // RN has no outer ring, so it is rebuilt as a 44px box: a 2px
                // ink border, 2px of --bg inside it, then the 36px circle.
                style={[
                  styles.swatchRing,
                  {
                    borderColor: selected ? ink[900] : 'transparent',
                    backgroundColor: selected ? colors.bg : 'transparent',
                  },
                ]}
              >
                <View style={[styles.swatch, { backgroundColor: covers[c].cover }]}>
                  {selected ? (
                    <Icon name="Check" size={16} strokeWidth={3} color={colors.onCover} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.block}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('events.boardMode')}
        </Text>
        <Tabs
          variant="segmented"
          value={mode}
          onChange={(id) => setMode(id as BoardMode)}
          items={[
            { id: 'approve_first', label: t('events.approveFirst') },
            { id: 'post_immediately', label: t('events.postImmediately') },
          ]}
          testID="create-mode"
        />
        <Text variant="caption" color={colors.text2}>
          {mode === 'approve_first'
            ? t('events.approveFirstLong')
            : t('events.postImmediatelyLong')}
        </Text>
      </View>

      <View style={styles.previewBlock}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('events.preview')}
        </Text>
        <EventCard {...previewCard} compact />
      </View>

      <Button
        size="lg"
        full
        icon="Plus"
        disabled={!valid}
        onPress={() => onCreate(draft)}
        testID="create-submit"
      >
        {t('events.create')}
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '94%' },
  block: { flexDirection: 'column', gap: 8 },
  previewBlock: { flexDirection: 'column', gap: 6 },
  dates: { flexDirection: 'row', gap: 8 },
  dateField: { flex: 1, flexDirection: 'column', gap: 6 },
  native: {
    borderWidth: 1.5,
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
