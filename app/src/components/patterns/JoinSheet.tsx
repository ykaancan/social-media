import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { ink, useTheme } from '../../theme';
import { EventCard, type EventCardProps } from '../cards';
import { Button } from '../core/Button';
import { Input } from '../core/Input';
import { Sheet } from '../core/Sheet';
import { Text } from '../core/Text';
import { Note } from './Note';
import { PickerRow } from './PickerRow';
import { SectionSheet, type SectionOption } from './SectionSheet';

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

/** The organisation an event belongs to, as the join sheet names it [D13]. */
export interface JoinOrganisation {
  id: string;
  name: string;
  /** [D15] Only then does the second step ask for a section. */
  hasSections: boolean;
}

/** The three membership answers of `POST /events/join` [D17]. */
export type MembershipRefusal = {
  ok: false;
  reason: 'membership_required' | 'membership_pending' | 'membership_rejected';
  organisation: JoinOrganisation;
  /** [D14] The organisation's admin reviews the request. */
  approvalRequired: boolean;
  eventName: string;
};

export type JoinResult =
  | { ok: true; event: JoinedEvent }
  | { ok: false; reason: 'not_found' | 'already_joined'; eventName?: string }
  | MembershipRefusal;

/**
 * What the screen reports after `POST /organisations/join`:
 * - `approved` — the person is in; `event` is the joined event when the screen
 *   could find it, so the sheet can show "You're in".
 * - `pending` — the request waits for the organisation's admin.
 * - `invalid_section` — the server refused the section (422 on `sectionId`).
 * Any other failure is a rejection of the promise.
 */
export type MembershipAnswer =
  | { status: 'approved'; event?: JoinedEvent }
  | { status: 'pending' }
  | { status: 'invalid_section' };

export interface JoinSheetProps {
  renderScanner?: (onCode: (code: string) => void) => React.ReactNode;
  /** The screen resolves the code (server call in the real app). */
  onSubmitCode: (code: string) => JoinResult | Promise<JoinResult>;
  /** [D15] The organisation's sections, for the second step's picker. */
  loadSections?: (organisationId: string) => Promise<SectionOption[]>;
  /** [D17] Sends the second step: the code the person used and the section they picked. */
  onRequestMembership?: (request: { code: string; sectionId?: string }) => Promise<MembershipAnswer>;
  /** Called when the scan view opens, so the screen can start the camera. */
  onScan?: () => void;
  /** Also called after a `pending` answer: the sheet has nothing more to show. */
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

type JoinView = 'code' | 'scan' | 'done' | 'request' | 'section';

/**
 * Join an event by code, or by QR. The views in one sheet: the code field, the
 * scanner frame, "You're in", and [D17] the second step for an event whose
 * organisation the person is not in yet — its name and the event's, the section
 * picker with the read-only country row where it has sections [D11]/[D15], and a
 * line about the admin's review where approval is on [D14].
 *
 * A `membership_pending` answer is said on the code view and has no second
 * step; `membership_rejected` is said there with an action to ask again, which
 * opens the second step (the server returns the membership to pending, P8).
 *
 * The camera itself is the screen's job — this sheet draws the frame and calls
 * `onScan` when it opens, so nothing here depends on a permission prompt.
 */
export function JoinSheet({ onSubmitCode, loadSections, onRequestMembership, onScan, onClose, onOpenEvent, renderScanner }: JoinSheetProps) {
  const { colors, radius, text } = useTheme();
  const { t } = useTranslation();
  const months = useMonthsShort();

  const [view, setView] = useState<JoinView>('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [joined, setJoined] = useState<JoinedEvent | null>(null);
  /** The membership answer for `askedCode`, and the code it was given for. */
  const [refusal, setRefusal] = useState<MembershipRefusal | null>(null);
  const [askedCode, setAskedCode] = useState('');
  const [sections, setSections] = useState<SectionOption[] | null>(null);
  const [sectionsFailed, setSectionsFailed] = useState(false);
  const [section, setSection] = useState<SectionOption | null>(null);
  const [sectionError, setSectionError] = useState<string | undefined>(undefined);

  const openRequest = (answer: MembershipRefusal) => {
    setSection(null);
    setSectionError(undefined);
    setError(undefined);
    setView('request');
    if (!answer.organisation.hasSections || !loadSections) return;
    setSections(null);
    setSectionsFailed(false);
    loadSections(answer.organisation.id).then(setSections, () => setSectionsFailed(true));
  };

  const submit = async (submittedCode = code) => {
    if (submitting.current) return;
    submitting.current = true;
    setError(undefined);
    setRefusal(null);
    setBusy(true);
    try {
      const result = await onSubmitCode(submittedCode);
      if (result.ok) {
        setJoined(result.event);
        setView('done');
        return;
      }
      if (result.reason === 'membership_required' || result.reason === 'membership_pending' || result.reason === 'membership_rejected') {
        setRefusal(result);
        setAskedCode(submittedCode);
        setView('code');
        if (result.reason === 'membership_required') openRequest(result);
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

  const request = async () => {
    if (submitting.current || !refusal || !onRequestMembership) return;
    submitting.current = true;
    setError(undefined);
    setSectionError(undefined);
    setBusy(true);
    try {
      const answer = await onRequestMembership({ code: askedCode, ...(section ? { sectionId: section.id } : {}) });
      if (answer.status === 'invalid_section') {
        setSectionError(t('joinFlow.sectionInvalid'));
      } else if (answer.status === 'approved' && answer.event) {
        setJoined(answer.event);
        setView('done');
      } else {
        onClose();
      }
    } catch {
      setError(t('eventFlow.requestError'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (view === 'section' && refusal) {
    return (
      <SectionSheet
        sections={sections ?? []}
        value={section?.id}
        onPick={(picked) => {
          setSection(picked);
          setSectionError(undefined);
          setView('request');
        }}
        onClose={() => setView('request')}
      />
    );
  }

  if (view === 'request' && refusal) {
    const names = { organisation: refusal.organisation.name, event: refusal.eventName };
    const needsSection = refusal.organisation.hasSections;
    return (
      <Sheet title={t('events.joinTitle')} onClose={busy ? undefined : onClose} testID="join-sheet">
        <Text variant="body" testID="join-request-intro">
          {t('joinFlow.intro', names)}
        </Text>
        {needsSection ? (
          <>
            <PickerRow
              label={t('onboarding.section')}
              icon="MapPin"
              value={section?.name}
              placeholder={t('onboarding.pickSection')}
              hint={sectionsFailed ? t('eventFlow.requestError') : t('onboarding.sectionHint')}
              error={sectionError}
              onPress={sections ? () => setView('section') : undefined}
              testID="join-section"
            />
            <PickerRow
              locked
              label={t('onboarding.country')}
              icon="Flag"
              value={section?.country}
              placeholder={t('onboarding.countryFromSection')}
              testID="join-country"
            />
          </>
        ) : null}
        {refusal.approvalRequired ? (
          <Note testID="join-approval-note">{t('joinFlow.approvalNote', names)}</Note>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" color={colors.danger}>
            {error}
          </Text>
        ) : null}
        <Button
          size="lg"
          full
          icon={refusal.approvalRequired ? 'Send' : 'LogIn'}
          loading={busy}
          disabled={busy || (needsSection && !section)}
          onPress={() => void request()}
          testID="join-request"
        >
          {refusal.approvalRequired ? t('joinFlow.sendRequest') : t('joinFlow.join')}
        </Button>
      </Sheet>
    );
  }

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
          setRefusal(null);
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
      {refusal?.reason === 'membership_pending' ? (
        <Note icon="Clock" testID="join-pending">
          {t('joinFlow.stillPending', { organisation: refusal.organisation.name })}
        </Note>
      ) : null}
      {refusal?.reason === 'membership_rejected' ? (
        <Note testID="join-rejected">
          <Text variant="bodySm" color={colors.text2}>
            {t('joinFlow.rejected', { organisation: refusal.organisation.name })}
          </Text>
          <Button variant="secondary" disabled={busy} onPress={() => openRequest(refusal)} testID="join-ask-again">
            {t('joinFlow.askAgain')}
          </Button>
        </Note>
      ) : null}
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
