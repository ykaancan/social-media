import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { ink, useTheme } from '../../theme';
import { EventCard, type EventCardProps } from '../cards';
import { Button } from '../core/Button';
import { Input } from '../core/Input';
import { Sheet } from '../core/Sheet';
import { Text } from '../core/Text';

/**
 * Join codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
 * (HANDOFF §4): I, O, 0 and 1 are excluded so a code read off a door poster
 * cannot be mistyped into a different event. The sanitiser below does NOT
 * enforce the alphabet — a typed `O` has to reach the server and come back as
 * "no event with that code", not silently vanish under the caret.
 */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

/** Anything the user can type -> at most 6 uppercase alphanumerics. */
export function sanitizeJoinCode(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, JOIN_CODE_LENGTH);
}

/** "K7Q4ZM" -> "K7Q-4ZM". Shorter input is passed through unhyphenated. */
export function displayJoinCode(code: string): string {
  return code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/** An event as the "You're in" card renders it. */
export type JoinedEvent = EventCardProps & { status: NonNullable<EventCardProps['status']> };

export type JoinResult =
  | { ok: true; event: JoinedEvent }
  | { ok: false; reason: 'not_found' | 'already_joined'; eventName?: string };

export interface JoinSheetProps {
  renderScanner?: (onCode: (code: string) => void) => React.ReactNode;
  /** The screen resolves the code (server call in the real app). */
  onSubmitCode: (code: string) => JoinResult | Promise<JoinResult>;
  /** Called when the scan view opens, so the screen can start the camera. */
  onScan?: () => void;
  onClose: () => void;
  onOpenEvent: (event: JoinedEvent) => void;
}

/** The date a not-yet-live board opens, from the card's own day/month fields. */
export function eventDateLabel(
  event: Pick<EventCardProps, 'day' | 'month' | 'dayEnd' | 'monthEnd'>,
  monthsShort: readonly string[],
  rangeSeparator = '–'
): string {
  const monthName = (m: EventCardProps['month']): string =>
    typeof m === 'number' ? (monthsShort[m - 1] ?? String(m)) : String(m ?? '');

  const start = `${event.day ?? ''} ${monthName(event.month)}`.trim();
  if (event.dayEnd == null) return start;

  const sameMonth = event.monthEnd == null || event.monthEnd === event.month;
  const end = sameMonth
    ? `${event.dayEnd}`
    : `${event.dayEnd} ${monthName(event.monthEnd)}`.trim();

  return sameMonth
    ? `${event.day}${rangeSeparator}${end} ${monthName(event.month)}`.trim()
    : `${start}${rangeSeparator}${end}`;
}

/** `dates.monthsShort` for the current locale, with a safe fallback. */
export function useMonthsShort(): string[] {
  const { i18n } = useTranslation();
  const value = i18n.t('dates.monthsShort', { returnObjects: true }) as unknown;
  return Array.isArray(value) ? (value as string[]) : [];
}

type JoinView = 'code' | 'scan' | 'done';

/**
 * Join an event by code, or by QR. Three views in one sheet: the code field,
 * the scanner frame, and "You're in".
 *
 * The camera itself is the screen's job — this sheet draws the frame and calls
 * `onScan` when it opens, so nothing here depends on a permission prompt.
 */
export function JoinSheet({ onSubmitCode, onScan, onClose, onOpenEvent, renderScanner }: JoinSheetProps) {
  const { colors, radius, text } = useTheme();
  const { t } = useTranslation();
  const months = useMonthsShort();

  const [view, setView] = useState<JoinView>('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [joined, setJoined] = useState<JoinedEvent | null>(null);

  const submit = async (submittedCode = code) => {
    if (submitting.current) return;
    submitting.current = true;
    setError(undefined);
    setBusy(true);
    try {
      const result = await onSubmitCode(submittedCode);
      if (result.ok) {
        setJoined(result.event);
        setView('done');
        return;
      }
      setError(
        result.reason === 'already_joined'
          ? t('events.alreadyIn', { name: result.eventName ?? '' })
          : t('events.codeNotFound')
      );
    } catch {
      setError(t('eventFlow.requestError'));
      setView('code');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (view === 'done' && joined) {
    return (
      <Sheet title={t('events.youreIn')} onClose={onClose} testID="join-sheet">
        <EventCard {...joined} />
        <Text variant="caption" color={colors.text2}>
          {joined.status === 'archived' ? t('eventFlow.archived') : joined.status === 'live'
            ? t('events.boardLive')
            : t('events.boardOpens', { date: eventDateLabel(joined, months) })}
        </Text>
        <Button
          size="lg"
          full
          icon="ArrowRight"
          onPress={() => onOpenEvent(joined)}
          testID="join-open"
        >
          {t('events.openEvent')}
        </Button>
      </Sheet>
    );
  }

  if (view === 'scan') {
    return (
      <Sheet title={t('events.scanTitle')} onClose={() => setView('code')} testID="join-sheet">
        {renderScanner ? renderScanner((value) => {
          const next = sanitizeJoinCode(value);
          setCode(next);
          setView('code');
          void submit(next);
        }) : <View style={[styles.scanPanel, { backgroundColor: ink[950], borderRadius: radius.card }]}>
          {CORNERS.map((c) => (
            <View key={c.key} style={[styles.bracket, c.style]} />
          ))}
          <Text variant="bodySm" color={ink[500]}>
            {t('events.scanHint')}
          </Text>
        </View>}
        <Button size="lg" full variant="ghost" onPress={() => setView('code')} testID="join-back">
          {t('events.enterCodeInstead')}
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('events.joinTitle')} onClose={busy ? undefined : onClose} testID="join-sheet">
      <Input
        label={t('events.joinCode')}
        value={displayJoinCode(code)}
        onChange={(v) => {
          setError(undefined);
          setCode(sanitizeJoinCode(v));
        }}
        placeholder="XXX-XXX"
        autoFocus
        maxLength={JOIN_CODE_LENGTH + 1}
        error={error}
        hint={t('events.codeHint')}
        inputStyle={[styles.codeInput, { fontFamily: text.displayMd.fontFamily }]}
        testID="join-code"
      />
      <Button
        size="lg"
        full
        icon="LogIn"
        loading={busy}
        disabled={code.length < JOIN_CODE_LENGTH}
        onPress={() => void submit()}
        testID="join-submit"
      >
        {t('events.join')}
      </Button>
      <Button
        size="lg"
        full
        variant="secondary"
        icon="QrCode"
        disabled={busy}
        onPress={() => {
          setView('scan');
          onScan?.();
        }}
        testID="join-scan"
      >
        {t('events.scanQr')}
      </Button>
    </Sheet>
  );
}

/** `.22em` of the 32px display size, in px — tracking and the matching indent. */
const CODE_TRACKING = 0.22 * 32;

const BRACKET = 28;
const INSET_V = 56;
const INSET_H = 72;

const CORNERS = [
  { key: 'tl', style: { top: INSET_V, left: INSET_H, borderTopWidth: 3, borderLeftWidth: 3 } },
  { key: 'tr', style: { top: INSET_V, right: INSET_H, borderTopWidth: 3, borderRightWidth: 3 } },
  { key: 'bl', style: { bottom: INSET_V, left: INSET_H, borderBottomWidth: 3, borderLeftWidth: 3 } },
  {
    key: 'br',
    style: { bottom: INSET_V, right: INSET_H, borderBottomWidth: 3, borderRightWidth: 3 },
  },
] as const;

const styles = StyleSheet.create({
  scanPanel: { height: 300, alignItems: 'center', justifyContent: 'center' },
  bracket: {
    position: 'absolute',
    width: BRACKET,
    height: BRACKET,
    borderRadius: 4,
    borderColor: '#fafafa',
  },
  codeInput: {
    fontSize: 32,
    lineHeight: 32,
    letterSpacing: CODE_TRACKING,
    paddingLeft: CODE_TRACKING,
    textAlign: 'center',
  },
});
