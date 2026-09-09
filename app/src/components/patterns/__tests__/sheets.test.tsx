import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text as RNText, type ViewStyle } from 'react-native';
import { initI18n, setLocale, t } from '../../../i18n';
import { EventColorProvider, palette, ThemeProvider } from '../../../theme';
import {
  buildEventDraft,
  closeBoardConfirmBody,
  Composer,
  ConfirmSheet,
  ControlsSheet,
  CreateSheet,
  displayJoinCode,
  inboxMoreItems,
  JoinSheet,
  ModsSheet,
  PersonPicker,
  MoreSheet,
  ReportSheet,
  sanitizeJoinCode,
  SectionSheet,
  senderFor,
  threadMoreItems,
  type JoinResult,
  type PickerPerson,
} from '../index';

initI18n();

// Sheets start their entrance animation at opacity 0 and reanimated's jest mock
// never advances it, so RNTL would treat every sheet body as hidden.
configure({ defaultIncludeHiddenElements: true });

const colors = palette('app');

/**
 * RNTL 14's `render` and `fireEvent` are async: every call in this file is
 * awaited, or the pending act scope leaks into the next test and its Modal
 * never mounts.
 */
function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider>{node}</EventColorProvider>
    </ThemeProvider>
  );
}

function bg(el: { props: { style?: unknown } }): string | undefined {
  return StyleSheet.flatten(el.props.style as ViewStyle)?.backgroundColor as string | undefined;
}

const ME = { name: 'Deniz Aksoy', section: 'ESN Ankara', country: 'Türkiye' };

const MEMBERS: PickerPerson[] = [
  { id: 'irem', name: 'İrem Doğan', section: 'ESN Boğaziçi', country: 'Türkiye' },
  { id: 'giulia', name: 'Giulia Ferri', section: 'ESN Bologna', country: 'Italy' },
  { id: 'kaan', name: 'Kaan Yılmaz', section: 'ESN İzmir', country: 'Türkiye' },
];

/* ------------------------------------------------------------------ *
 * ConfirmSheet
 * ------------------------------------------------------------------ */

describe('ConfirmSheet', () => {
  const props = {
    title: 'Close the board?',
    body: 'No one can post after this.',
    action: 'Close board',
    onClose: jest.fn(),
    onConfirm: jest.fn(),
  };

  it('is danger by default', async () => {
    await wrap(<ConfirmSheet {...props} />);
    expect(bg(screen.getByTestId('confirm-action').children[0] as never)).toBe(colors.dangerSoft);
  });

  it('is primary when danger is false (the reveal confirm)', async () => {
    await wrap(<ConfirmSheet {...props} danger={false} />);
    expect(bg(screen.getByTestId('confirm-action').children[0] as never)).toBe(colors.primary);
  });

  it('confirms and cancels through the right callbacks', async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    await wrap(<ConfirmSheet {...props} onConfirm={onConfirm} onClose={onClose} />);

    await fireEvent.press(screen.getByTestId('confirm-action'));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('confirm-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the optional preview block', async () => {
    await wrap(<ConfirmSheet {...props} danger={false} preview={<RNText>They will see Deniz</RNText>} />);
    expect(screen.getByText('They will see Deniz')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * ReportSheet
 * ------------------------------------------------------------------ */

describe('ReportSheet', () => {
  const post = { text: 'Whoever fixed the mic: hero', sender: { level: 'anonymous' as const } };

  it('keeps Report disabled until a reason is picked, then reports its id', async () => {
    const onReport = jest.fn();
    await wrap(<ReportSheet post={post} onClose={jest.fn()} onReport={onReport} />);

    const submit = screen.getByTestId('report-submit');
    expect(submit.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(submit);
    expect(onReport).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText(t('report.reasons.spam')));
    expect(screen.getByTestId('report-submit').props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(screen.getByTestId('report-submit'));
    expect(onReport).toHaveBeenCalledWith('spam');
  });

  it('offers the five fixed reasons, with no thread note by default', async () => {
    await wrap(<ReportSheet onClose={jest.fn()} onReport={jest.fn()} />);
    for (const id of ['harassment', 'hate', 'sexual', 'identity', 'spam']) {
      expect(screen.getByText(t(`report.reasons.${id}`))).toBeTruthy();
    }
    expect(screen.queryByText(t('report.threadNote'))).toBeNull();
  });

  it('adds the thread note in the thread variant', async () => {
    await wrap(<ReportSheet threadNote onClose={jest.fn()} onReport={jest.fn()} />);
    expect(screen.getByText(t('report.threadNote'))).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * inboxMoreItems — [D12] states, [D6] block by message id
 * ------------------------------------------------------------------ */

describe('inboxMoreItems', () => {
  const ids = (state: 'new' | 'private' | 'approved', sender: Parameters<typeof inboxMoreItems>[0]['sender']) =>
    inboxMoreItems({ state, sender }, t).map((i) => i.id);

  it('offers "take off the wall" only on an approved message', () => {
    const anon = { level: 'anonymous' as const };
    expect(ids('new', anon)).toEqual(['reply', 'report', 'block', 'delete']);
    expect(ids('private', anon)).toEqual(['reply', 'report', 'block', 'delete']);
    expect(ids('approved', anon)).toEqual(['reply', 'private', 'report', 'block', 'delete']);
  });

  it('names the person only when the sender is named', () => {
    const named = inboxMoreItems(
      { state: 'new', sender: { level: 'named', name: 'Kaan Yılmaz' } },
      t
    );
    expect(named.find((i) => i.id === 'block')?.label).toBe(t('common.blockName', { name: 'Kaan' }));

    for (const sender of [
      { level: 'anonymous' as const },
      { level: 'hint' as const, hints: { section: 'ESN İzmir' } },
    ]) {
      const items = inboxMoreItems({ state: 'new', sender }, t);
      expect(items.find((i) => i.id === 'block')?.label).toBe(t('inbox.blockSender'));
    }
  });

  it('marks only delete as danger, and never claims the content is removed', () => {
    const items = inboxMoreItems({ state: 'approved', sender: { level: 'anonymous' } }, t);
    expect(items.filter((i) => i.danger).map((i) => i.id)).toEqual(['delete']);
    for (const item of items) expect(item.label.toLowerCase()).not.toContain('remove');
  });
});

/* ------------------------------------------------------------------ *
 * threadMoreItems — thread-app.jsx line 161
 * ------------------------------------------------------------------ */

describe('threadMoreItems', () => {
  it('offers Reveal only while there is something left to reveal', () => {
    expect(threadMoreItems({ canReveal: true, otherIsNamed: false }, t).map((i) => i.id)).toEqual([
      'reveal',
      'report',
      'block',
    ]);
    // [D5] reveal is one-way: once done, the action is gone.
    expect(threadMoreItems({ canReveal: false, otherIsNamed: false }, t).map((i) => i.id)).toEqual([
      'report',
      'block',
    ]);
  });

  it('carries the reveal warning as the row description', () => {
    const reveal = threadMoreItems({ canReveal: true, otherIsNamed: false }, t)[0];
    expect(reveal?.label).toBe(t('anon.revealMyself'));
    expect(reveal?.description).toBe(t('thread.revealDesc'));
    // [D5] the warning is about future messages, not the ones already sent.
    expect(reveal?.description).toBe("They see your name and photo. Can't be undone here.");
  });

  it('[D6] names the other person only when they are named', () => {
    const named = threadMoreItems(
      { canReveal: false, otherIsNamed: true, otherFirstName: 'Deniz Aksoy' },
      t
    );
    expect(named.find((i) => i.id === 'block')?.label).toBe(t('common.blockName', { name: 'Deniz' }));

    const anon = threadMoreItems({ canReveal: true, otherIsNamed: false }, t);
    expect(anon.find((i) => i.id === 'block')?.label).toBe(t('common.block'));
  });

  it('marks only block as danger', () => {
    const items = threadMoreItems({ canReveal: true, otherIsNamed: false }, t);
    expect(items.filter((i) => i.danger).map((i) => i.id)).toEqual(['block']);
  });
});

/* ------------------------------------------------------------------ *
 * MoreSheet — the shell both helpers feed
 * ------------------------------------------------------------------ */

describe('MoreSheet', () => {
  const post = { text: 'Bus back to the hotel leaves at 02:00 sharp', sender: { level: 'anonymous' as const } };

  it('previews the message when there is one', async () => {
    await wrap(
      <MoreSheet
        post={post}
        items={inboxMoreItems({ state: 'new', sender: post.sender }, t)}
        onPick={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText(post.text)).toBeTruthy();
  });

  it('opens with no preview at all in the thread variant', async () => {
    await wrap(
      <MoreSheet
        items={threadMoreItems({ canReveal: true, otherIsNamed: false }, t)}
        onPick={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.queryByText(post.text)).toBeNull();
    expect(screen.getByTestId('more-reveal')).toBeTruthy();
    // the description renders under its label
    expect(screen.getByText(t('thread.revealDesc'))).toBeTruthy();
  });

  it('reports the picked id', async () => {
    const onPick = jest.fn();
    await wrap(
      <MoreSheet
        items={threadMoreItems({ canReveal: true, otherIsNamed: false }, t)}
        onPick={onPick}
        onClose={jest.fn()}
      />
    );
    await fireEvent.press(screen.getByTestId('more-block'));
    expect(onPick).toHaveBeenCalledWith('block');
  });
});

/* ------------------------------------------------------------------ *
 * senderFor — the port of full-app.jsx line 173
 * ------------------------------------------------------------------ */

describe('senderFor', () => {
  it('carries nothing at anonymous', () => {
    expect(senderFor(ME, 'anonymous', { section: true })).toEqual({
      level: 'anonymous',
      name: undefined,
      avatar: undefined,
      hints: undefined,
    });
  });

  it('carries only the ticked hint fields', () => {
    expect(senderFor(ME, 'hint', { section: true, letter: true })).toEqual({
      level: 'hint',
      name: undefined,
      avatar: undefined,
      hints: { section: 'ESN Ankara', country: undefined, letter: 'D' },
    });
    expect(senderFor(ME, 'hint', { country: true }).hints).toEqual({
      section: undefined,
      country: 'Türkiye',
      letter: undefined,
    });
  });

  it('carries the name (and photo) at named, and no hints', () => {
    expect(senderFor({ ...ME, avatar: 'file://me.jpg' }, 'named', { section: true })).toEqual({
      level: 'named',
      name: 'Deniz Aksoy',
      avatar: 'file://me.jpg',
      hints: undefined,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Composer
 * ------------------------------------------------------------------ */

describe('Composer', () => {
  const base = { me: ME, members: MEMBERS, onClose: jest.fn(), onSend: jest.fn() };

  it('titles a board composer "To the room" and shows the target tabs', async () => {
    await wrap(<Composer {...base} />);
    expect(screen.getByText(t('board.toTheRoom').toUpperCase())).toBeTruthy();
    expect(screen.getByTestId('composer-target')).toBeTruthy();
  });

  it('titles a wall composer with the owner and drops the target tabs', async () => {
    await wrap(<Composer {...base} wallOwner={MEMBERS[1]} />);
    expect(screen.getByText(t('composer.toWall', { name: 'Giulia' }).toUpperCase())).toBeTruthy();
    expect(screen.queryByTestId('composer-target')).toBeNull();
  });

  it('titles the composer with the person once one is picked', async () => {
    await wrap(<Composer {...base} wallOwner={MEMBERS[2]} />);
    expect(screen.getByText(t('composer.toWall', { name: 'Kaan' }).toUpperCase())).toBeTruthy();
  });

  it('warns a member that an approve_first board holds room posts', async () => {
    await wrap(<Composer {...base} boardMode="approve_first" />);
    expect(screen.getByTestId('composer-approve-first')).toBeTruthy();
  });

  it('[D9] never warns a moderator, whose room post publishes immediately', async () => {
    await wrap(<Composer {...base} boardMode="approve_first" isModerator />);
    expect(screen.queryByTestId('composer-approve-first')).toBeNull();
  });

  it('never warns on a post_immediately board', async () => {
    await wrap(<Composer {...base} boardMode="post_immediately" />);
    expect(screen.queryByTestId('composer-approve-first')).toBeNull();
  });

  it('sends the trimmed text with the chosen sender and target', async () => {
    const onSend = jest.fn();
    await wrap(<Composer {...base} onSend={onSend} />);

    const send = screen.getByTestId('composer-send');
    expect(send.props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('composer-text'), '  hi room  ');
    await fireEvent.press(screen.getByTestId('composer-send'));

    expect(onSend).toHaveBeenCalledWith({
      text: 'hi room',
      sender: senderFor(ME, 'anonymous', { section: true }),
      target: 'room',
      person: undefined,
    });
  });

  it('a wall composer sends to its fixed owner', async () => {
    const onSend = jest.fn();
    await wrap(<Composer {...base} wallOwner={MEMBERS[0]} onSend={onSend} />);
    await fireEvent.changeText(screen.getByTestId('composer-text'), 'nice hat');
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'nice hat', target: 'person', person: MEMBERS[0] })
    );
  });
});

/* ------------------------------------------------------------------ *
 * PersonPicker
 * ------------------------------------------------------------------ */

describe('PersonPicker', () => {
  it('searches Turkish-aware: "irem" finds "İrem Doğan"', async () => {
    await wrap(<PersonPicker members={MEMBERS} onPick={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('person-picker-search'), 'irem');
    expect(screen.getByText('İrem Doğan')).toBeTruthy();
    expect(screen.queryByText('Giulia Ferri')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('person-picker-search'), 'yilmaz');
    expect(screen.getByText('Kaan Yılmaz')).toBeTruthy();
  });

  it('shows the empty line when nothing matches', async () => {
    await wrap(<PersonPicker members={MEMBERS} onPick={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('person-picker-search'), 'zzz');
    expect(screen.getByText(t('composer.noOneHere'))).toBeTruthy();
  });

  it('picks a person', async () => {
    const onPick = jest.fn();
    await wrap(<PersonPicker members={MEMBERS} onPick={onPick} />);
    await fireEvent.press(screen.getByText('Giulia Ferri'));
    expect(onPick).toHaveBeenCalledWith(MEMBERS[1]);
  });

  // The picker lives inside a Sheet, whose body is itself a ScrollView. On
  // Android the inner list does not scroll at all unless it opts in, and a tap
  // straight after typing is eaten by the keyboard dismissal without
  // keyboardShouldPersistTaps.
  it('scrolls inside the sheet: nested, tap-through, and still capped at 220', async () => {
    await wrap(<PersonPicker members={MEMBERS} onPick={jest.fn()} />);
    const list = screen.getByTestId('person-picker-list');
    expect(list.props.nestedScrollEnabled).toBe(true);
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    expect((StyleSheet.flatten(list.props.style) as { maxHeight?: number }).maxHeight).toBe(220);
  });
});

/* ------------------------------------------------------------------ *
 * SectionSheet — [D11] a section is a country
 * ------------------------------------------------------------------ */

describe('SectionSheet', () => {
  const SECTIONS = [
    { id: 'ank', name: 'ESN Ankara', country: 'Türkiye', members: 212 },
    { id: 'izm', name: 'ESN İzmir', country: 'Türkiye', members: 148 },
    { id: 'bol', name: 'ESN Bologna', country: 'Italy', members: 264 },
  ];

  it('groups the sections by country', async () => {
    await wrap(<SectionSheet sections={SECTIONS} onPick={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByTestId('section-group-Türkiye')).toBeTruthy();
    expect(screen.getByTestId('section-group-Italy')).toBeTruthy();
  });

  it('searches by country as well as by section name', async () => {
    await wrap(<SectionSheet sections={SECTIONS} onPick={jest.fn()} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('section-search'), 'italy');
    expect(screen.getByText('ESN Bologna')).toBeTruthy();
    expect(screen.queryByText('ESN Ankara')).toBeNull();

    // Turkish-aware: "turkiye" folds onto "Türkiye".
    await fireEvent.changeText(screen.getByTestId('section-search'), 'turkiye');
    expect(screen.getByText('ESN Ankara')).toBeTruthy();
    expect(screen.getByText('ESN İzmir')).toBeTruthy();
    expect(screen.queryByText('ESN Bologna')).toBeNull();
  });

  it('marks the chosen section and reports the whole option back', async () => {
    const onPick = jest.fn();
    await wrap(<SectionSheet sections={SECTIONS} value="izm" onPick={onPick} onClose={jest.fn()} />);

    expect(bg(screen.getByTestId('section-izm'))).toBe(colors.surfaceMuted);
    expect(bg(screen.getByTestId('section-ank'))).toBe(colors.surface);

    await fireEvent.press(screen.getByTestId('section-bol'));
    expect(onPick).toHaveBeenCalledWith(SECTIONS[2]);
  });

  it('says so when nothing matches', async () => {
    await wrap(<SectionSheet sections={SECTIONS} onPick={jest.fn()} onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('section-search'), 'qqq');
    expect(screen.getByText(t('section.noneFound'))).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * JoinSheet
 * ------------------------------------------------------------------ */

describe('join codes', () => {
  it('sanitises anything typed into six uppercase alphanumerics', () => {
    expect(sanitizeJoinCode('k7q-4zm')).toBe('K7Q4ZM');
    expect(sanitizeJoinCode('npl 026 extra')).toBe('NPL026');
    expect(sanitizeJoinCode('!!!')).toBe('');
    expect(sanitizeJoinCode('abcdefgh')).toBe('ABCDEF');
  });

  it('hyphens after the third character only', () => {
    expect(displayJoinCode('K7Q4ZM')).toBe('K7Q-4ZM');
    expect(displayJoinCode('K7Q')).toBe('K7Q');
    expect(displayJoinCode('K7Q4')).toBe('K7Q-4');
    expect(displayJoinCode('')).toBe('');
  });
});

describe('JoinSheet', () => {
  const props = { onClose: jest.fn(), onOpenEvent: jest.fn() };

  const type = (code: string) => fireEvent.changeText(screen.getByTestId('join-code'), code);

  it('stays disabled under six characters', async () => {
    await wrap(<JoinSheet {...props} onSubmitCode={() => ({ ok: false, reason: 'not_found' })} />);
    expect(screen.getByTestId('join-submit').props.accessibilityState.disabled).toBe(true);
    await type('K7Q4Z');
    expect(screen.getByTestId('join-submit').props.accessibilityState.disabled).toBe(true);
    await type('K7Q4ZM');
    expect(screen.getByTestId('join-submit').props.accessibilityState.disabled).toBe(false);
  });

  it('shows the not-found copy', async () => {
    const onSubmitCode = jest.fn((): JoinResult => ({ ok: false, reason: 'not_found' }));
    await wrap(<JoinSheet {...props} onSubmitCode={onSubmitCode} />);
    await type('AAA111');
    await fireEvent.press(screen.getByTestId('join-submit'));
    expect(onSubmitCode).toHaveBeenCalledWith('AAA111');
    expect(await screen.findByText(t('events.codeNotFound'))).toBeTruthy();
  });

  it('shows the already-joined copy with the event name', async () => {
    await wrap(
      <JoinSheet
        {...props}
        onSubmitCode={() => ({ ok: false, reason: 'already_joined', eventName: 'Ankara Karaoke' })}
      />
    );
    await type('KAR4OK');
    await fireEvent.press(screen.getByTestId('join-submit'));
    expect(
      await screen.findByText(t('events.alreadyIn', { name: 'Ankara Karaoke' }))
    ).toBeTruthy();
  });

  it('lands on "You\'re in" and opens the event', async () => {
    const onOpenEvent = jest.fn();
    const event = { name: 'National Platform 2026', status: 'live' as const, cover: 'magenta' as const };
    await wrap(
      <JoinSheet {...props} onOpenEvent={onOpenEvent} onSubmitCode={() => ({ ok: true, event })} />
    );
    await type('NPL026');
    await fireEvent.press(screen.getByTestId('join-submit'));

    expect(await screen.findByText(t('events.boardLive'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('join-open'));
    expect(onOpenEvent).toHaveBeenCalledWith(event);
  });
});

/* ------------------------------------------------------------------ *
 * buildEventDraft
 * ------------------------------------------------------------------ */

describe('buildEventDraft', () => {
  const base = {
    name: '  İzmir Welcome Night  ',
    scope: 'section' as const,
    cover: 'azure' as const,
    mode: 'approve_first' as const,
    mySection: 'ESN İzmir',
  };

  it('a single night keeps one date and an HH:mm range', () => {
    const draft = buildEventDraft({
      ...base,
      start: new Date(2026, 10, 22, 20, 0),
      end: new Date(2026, 10, 23, 1, 0),
    });
    // 22 Nov 20:00 -> 23 Nov 01:00 is two calendar days, so it is multi-day.
    expect(draft.multiDay).toBe(true);

    const oneNight = buildEventDraft({
      ...base,
      start: new Date(2026, 9, 3, 21, 0),
      end: new Date(2026, 9, 3, 23, 30),
    });
    expect(oneNight).toMatchObject({
      name: 'İzmir Welcome Night',
      status: 'upcoming',
      day: '3',
      month: 10,
      dayEnd: undefined,
      monthEnd: undefined,
      timeRange: '21:00–23:30',
      scope: 'ESN İzmir',
      multiDay: false,
    });
  });

  it('a multi-day board inside one month carries dayEnd but no monthEnd', () => {
    const draft = buildEventDraft({
      ...base,
      scope: 'national',
      start: new Date(2026, 10, 14, 18, 0),
      end: new Date(2026, 10, 16, 2, 0),
    });
    expect(draft).toMatchObject({
      day: '14',
      month: 11,
      dayEnd: '16',
      monthEnd: undefined,
      timeRange: 'Sat–Mon',
      scope: 'National',
      multiDay: true,
    });
  });

  it('a board crossing a month carries monthEnd too', () => {
    const draft = buildEventDraft({
      ...base,
      start: new Date(2026, 10, 30, 9, 0),
      end: new Date(2026, 11, 2, 18, 0),
    });
    expect(draft).toMatchObject({ day: '30', month: 11, dayEnd: '2', monthEnd: 12, multiDay: true });
  });

  it('falls back to a placeholder name so the preview card is never blank', () => {
    expect(buildEventDraft({ ...base, name: '   ', start: new Date(), end: new Date() }).name).toBe(
      'Event name'
    );
  });

  it('takes both fallbacks from i18n, never from a hard-coded English string', async () => {
    const blank = { ...base, name: '  ', scope: 'national' as const, start: new Date(), end: new Date() };
    expect(buildEventDraft(blank)).toMatchObject({ name: t('events.name'), scope: t('events.national') });

    await setLocale('tr');
    try {
      expect(buildEventDraft(blank)).toMatchObject({ name: 'Etkinlik adı', scope: 'Ulusal' });
    } finally {
      await setLocale('en');
    }
  });
});

describe('CreateSheet', () => {
  it('takes the name field example from i18n, not from a literal', async () => {
    await wrap(
      <CreateSheet
        me={{ section: 'ESN İzmir' }}
        start={new Date(2026, 10, 22, 20, 0)}
        end={new Date(2026, 10, 23, 1, 0)}
        onPickStart={jest.fn()}
        onPickEnd={jest.fn()}
        onClose={jest.fn()}
        onCreate={jest.fn()}
      />
    );
    expect(screen.getByTestId('create-name').props.placeholder).toBe(t('events.namePlaceholder'));
  });
});

/* ------------------------------------------------------------------ *
 * ModsSheet
 * ------------------------------------------------------------------ */

describe('ModsSheet', () => {
  const creator = MEMBERS[2];
  const mods = [MEMBERS[0]];
  const pool = [MEMBERS[1]];

  const props = {
    me: creator,
    creator,
    mods,
    pool,
    eventName: 'National Platform 2026',
    onAdd: jest.fn(),
    onRemove: jest.fn(),
    onClose: jest.fn(),
  };

  it('gives the creator no remove button, and every co-moderator one', async () => {
    await wrap(<ModsSheet {...props} />);
    expect(screen.queryByTestId(`mods-remove-${creator.id}`)).toBeNull();
    expect(screen.getByTestId(`mods-remove-${mods[0].id}`)).toBeTruthy();
  });

  it('removes a co-moderator by person', async () => {
    const onRemove = jest.fn();
    await wrap(<ModsSheet {...props} onRemove={onRemove} />);
    await fireEvent.press(screen.getByTestId(`mods-remove-${mods[0].id}`));
    expect(onRemove).toHaveBeenCalledWith(mods[0]);
  });

  it('switches to the add view and adds from the joined pool only', async () => {
    const onAdd = jest.fn();
    await wrap(<ModsSheet {...props} onAdd={onAdd} />);

    await fireEvent.press(screen.getByTestId('mods-add'));
    expect(
      screen.getByText(t('events.onlyJoinedCanModerate', { name: 'National Platform 2026' }))
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`mods-add-${pool[0].id}`));
    expect(onAdd).toHaveBeenCalledWith(pool[0]);
  });
});

/* ------------------------------------------------------------------ *
 * ControlsSheet
 * ------------------------------------------------------------------ */

describe('ControlsSheet', () => {
  const props = {
    mode: 'approve_first' as const,
    onMode: jest.fn(),
    end: '02:00',
    endOptions: ['01:00', '02:00', '03:00'],
    onEnd: jest.fn(),
    onCloseBoard: jest.fn(),
    onClose: jest.fn(),
  };

  it('[D4] warns that waiting posts will not be published, only when some are', () => {
    expect(closeBoardConfirmBody(t)).toBe(t('events.closeConfirmBody'));
    expect(closeBoardConfirmBody(t, 0)).toBe(t('events.closeConfirmBody'));
    expect(closeBoardConfirmBody(t, 4)).toBe(t('events.closeConfirmBodyWaiting', { n: 4 }));
    expect(closeBoardConfirmBody(t, 4)).toContain('4');
  });

  it('keeps the queue reachable in the caption when posts are still waiting', async () => {
    await wrap(<ControlsSheet {...props} mode="post_immediately" pendingCount={3} />);
    expect(screen.getByTestId('controls-mode-caption')).toHaveTextContent(
      `${t('events.modeImmediate')} ${t('events.stillWaiting', { n: 3 })}`
    );
  });

  it('says nothing about waiting posts when there are none', async () => {
    await wrap(<ControlsSheet {...props} mode="post_immediately" />);
    expect(screen.getByTestId('controls-mode-caption')).toHaveTextContent(t('events.modeImmediate'));
    expect(screen.queryByText(t('events.stillWaiting', { n: 3 }))).toBeNull();
  });

  it('offers "No end" alongside the times and reports null for it', async () => {
    const onEnd = jest.fn();
    await wrap(<ControlsSheet {...props} onEnd={onEnd} />);
    await fireEvent.press(screen.getByText(t('events.noEnd')));
    expect(onEnd).toHaveBeenCalledWith(null);

    await fireEvent.press(screen.getByText('03:00'));
    expect(onEnd).toHaveBeenCalledWith('03:00');
  });

  it('hands the close decision to the screen', async () => {
    const onCloseBoard = jest.fn();
    await wrap(<ControlsSheet {...props} onCloseBoard={onCloseBoard} />);
    await fireEvent.press(screen.getByTestId('controls-close-board'));
    expect(onCloseBoard).toHaveBeenCalledTimes(1);
  });
});


describe('Composer delivery screening', () => {
  it('requires acknowledgement for the exact draft and screens edited text again', async () => {
    const onScreen = jest.fn(async () => ({warning:true}));
    const onSend = jest.fn();
    await wrap(<Composer me={ME} wallOwner={MEMBERS[0]} onClose={() => {}} onScreen={onScreen} onSend={onSend} />);
    await fireEvent.changeText(screen.getByTestId('composer-text'), 'First draft');
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-screening-warning')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('composer-text'), 'Edited draft');
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onScreen).toHaveBeenCalledTimes(2);
    expect(onSend).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({text:'Edited draft',screeningAcknowledged:true}));
  });
  it('keeps the draft when delivery fails', async () => {
    await wrap(<Composer me={ME} wallOwner={MEMBERS[0]} onClose={() => {}} onSend={async () => {throw new Error('offline');}} />);
    await fireEvent.changeText(screen.getByTestId('composer-text'), 'Keep my draft');
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(screen.getByTestId('composer-text').props.value).toBe('Keep my draft');
    expect(screen.getByText(t('messageFlow.sendError'))).toBeTruthy();
  });
});
