import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { initI18n } from '../../../i18n';
import { covers, palette, ThemeProvider } from '../../../theme';
import { EventCard } from '../EventCard';

initI18n();
configure({ defaultIncludeHiddenElements: true });

const colors = palette('app');

function wrap(node: React.ReactNode) {
  // No EventColorProvider here on purpose: the card provides its own.
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

describe('EventCard — the six date specimens from cards.card.html', () => {
  it('single night: day over month', async () => {
    await wrap(<EventCard name="Ankara Karaoke" status="live" cover="lime" day="03" month={10} />);
    expect(screen.getByText('03')).toBeTruthy();
    expect(screen.getByText('OCT')).toBeTruthy();
  });

  it('same-month range: "14–16" over the month', async () => {
    await wrap(
      <EventCard name="National Platform 2026" status="live" day="14" dayEnd="16" month={11} />
    );
    expect(screen.getByText('14–16')).toBeTruthy();
    expect(screen.getByText('NOV')).toBeTruthy();
  });

  it('cross-month range: "30 Nov–2 Dec" with no month line', async () => {
    await wrap(
      <EventCard
        name="Cappadocia Trip"
        status="upcoming"
        cover="azure"
        day="30"
        dayEnd="2"
        month={11}
        monthEnd={12}
        compact
      />
    );
    expect(screen.getByText('30 Nov–2 Dec')).toBeTruthy();
    expect(screen.queryByText('NOV')).toBeNull();
    expect(screen.queryByText('DEC')).toBeNull();
  });

  it('a same-month range given an explicit monthEnd is not treated as cross-month', async () => {
    await wrap(
      <EventCard name="Regional Platform" status="archived" day="4" dayEnd="6" month={4} monthEnd={4} />
    );
    expect(screen.getByText('4–6')).toBeTruthy();
    expect(screen.getByText('APR')).toBeTruthy();
  });

  it('passes a string month straight through', async () => {
    await wrap(<EventCard name="Pub Quiz" day="17" month="Eyl" />);
    expect(screen.getByText('EYL')).toBeTruthy();
  });
});

describe('EventCard — locale', () => {
  it('locale="tr" switches month and status label together', async () => {
    await wrap(
      <EventCard
        locale="tr"
        name="National Platform 2026"
        status="upcoming"
        day="14"
        dayEnd="16"
        month={11}
        scope="Ulusal"
        memberCount={212}
        compact
      />
    );
    expect(screen.getByText('KAS')).toBeTruthy();
    expect(screen.getByText('YAKLAŞAN')).toBeTruthy();
  });

  it('locale="en" gives Nov / Upcoming for the same event', async () => {
    await wrap(
      <EventCard
        locale="en"
        name="National Platform 2026"
        status="upcoming"
        day="14"
        dayEnd="16"
        month={11}
        compact
      />
    );
    expect(screen.getByText('NOV')).toBeTruthy();
    expect(screen.getByText('UPCOMING')).toBeTruthy();
  });

  it('a `labels` override wins over the string table', async () => {
    await wrap(<EventCard name="X" status="live" labels={{ live: 'On now' }} day="1" month={1} />);
    expect(screen.getByText('ON NOW')).toBeTruthy();
  });
});

describe('EventCard — status skins', () => {
  const shell = (testID: string) =>
    StyleSheet.flatten(
      (screen.getByTestId(testID).children[0] as { props: { style?: unknown } }).props
        .style as ViewStyle
    );

  it('live fills with the cover colour and drops the ring', async () => {
    await wrap(<EventCard testID="ev" name="X" status="live" cover="lime" day="1" month={1} />);
    const s = shell('ev');
    expect(s.backgroundColor).toBe(covers.lime.cover);
    expect(s.borderWidth).toBeUndefined();
    expect(s.padding).toBe(16);
  });

  it('upcoming keeps the surface plus a 1px ring, with the padding compensated', async () => {
    await wrap(<EventCard testID="ev" name="X" status="upcoming" day="1" month={1} />);
    const s = shell('ev');
    expect(s.backgroundColor).toBe(colors.surface);
    expect(s.borderWidth).toBe(1);
    expect(s.borderColor).toBe(colors.border);
    expect(s.padding).toBe(15);
  });

  it('archived goes muted', async () => {
    await wrap(<EventCard testID="ev" name="X" status="archived" day="1" month={1} />);
    expect(shell('ev').backgroundColor).toBe(colors.surfaceMuted);
  });

  it('defaults to the magenta cover', async () => {
    await wrap(<EventCard testID="ev" name="X" status="live" day="1" month={1} />);
    expect(shell('ev').backgroundColor).toBe(covers.magenta.cover);
  });
});

describe('EventCard — meta and press', () => {
  it('renders only the meta items it was given', async () => {
    await wrap(
      <EventCard
        name="Ankara Karaoke"
        status="live"
        day="03"
        month={10}
        timeRange="21:00–01:00"
        scope="ESN Ankara"
        memberCount={64}
        postCount={188}
      />
    );
    expect(screen.getByText('ESN Ankara')).toBeTruthy();
    expect(screen.getByText('21:00–01:00')).toBeTruthy();
    expect(screen.getByText('64')).toBeTruthy();
    expect(screen.getByText('188')).toBeTruthy();
  });

  it('uppercases the name and fires onPress', async () => {
    const onPress = jest.fn();
    await wrap(<EventCard testID="ev" name="Ankara Karaoke" day="1" month={1} onPress={onPress} />);
    expect(screen.getByText('ANKARA KARAOKE')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ev'));
    expect(onPress).toHaveBeenCalled();
  });

  it('uppercases Turkish dotted i correctly at locale tr', async () => {
    await wrap(<EventCard locale="tr" name="İzmir Welcome Night" day="22" month={11} />);
    expect(screen.getByText('İZMİR WELCOME NİGHT')).toBeTruthy();
  });

  it("the status pill takes the CARD's locale, not the app's", async () => {
    // The app locale is `en` here (initI18n above); one locale per surface, so
    // the pill must label AND uppercase in the card's locale.
    await wrap(<EventCard locale="tr" status="upcoming" name="Kapadokya" day="30" month={11} />);
    expect(screen.getByText('YAKLAŞAN')).toBeTruthy();
    expect(screen.queryByText('UPCOMING')).toBeNull();
  });

  it("folds the live pill's dotless ı to a plain I at locale tr", async () => {
    await wrap(<EventCard locale="tr" status="live" name="Ankara" day="03" month={10} />);
    // "Canlı" -> "CANLI", never "CANLİ".
    expect(screen.getByText('CANLI')).toBeTruthy();
  });
});
