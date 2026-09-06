import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { initI18n, setLocale } from '../../../i18n';
import { EventColorProvider, ink, palette, ThemeProvider } from '../../../theme';
import { LG_FONT_SIZE, LG_LINE_HEIGHT, StatusPill } from '../StatusPill';

initI18n();

function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider>{node}</EventColorProvider>
    </ThemeProvider>
  );
}

const colors = palette('app');

afterEach(async () => {
  await setLocale('en');
});

describe('StatusPill', () => {
  it('labels itself from the status table, uppercased', async () => {
    await wrap(<StatusPill status="pending" />);
    expect(screen.getByText('IN QUEUE')).toBeTruthy();
  });

  it('uses the Turkish table and Turkish uppercasing when the locale is tr', async () => {
    await setLocale('tr');
    await wrap(<StatusPill status="live" />);
    // "Canlı" -> dotless ı becomes I, never a dotted İ
    expect(screen.getByText('CANLI')).toBeTruthy();
  });

  it('lets an explicit label win over the table', async () => {
    await wrap(<StatusPill status="archived" label="Kapandı" />);
    expect(screen.getByText('KAPANDI')).toBeTruthy();
  });

  it('shows the pulsing dot on a live board', async () => {
    await wrap(<StatusPill status="live" />);
    expect(screen.getByTestId('status-pill-dot')).toBeTruthy();
  });

  it('shows no dot on any other status', async () => {
    await wrap(<StatusPill status="upcoming" />);
    expect(screen.queryByTestId('status-pill-dot')).toBeNull();
  });

  it('paints each status', async () => {
    await wrap(
      <>
        <StatusPill testID="live" status="live" />
        <StatusPill testID="archived" status="archived" />
        <StatusPill testID="rejected" status="rejected" />
        <StatusPill testID="onwall" status="onwall" />
      </>
    );
    expect(StyleSheet.flatten(screen.getByTestId('live').props.style).backgroundColor).toBe(colors.live);

    const archived = StyleSheet.flatten(screen.getByTestId('archived').props.style);
    expect(archived.backgroundColor).toBe('transparent');
    expect(archived.borderWidth).toBe(1);
    expect(archived.borderColor).toBe(colors.borderStrong);

    expect(StyleSheet.flatten(screen.getByTestId('rejected').props.style).backgroundColor).toBe(
      colors.dangerSoft
    );
    expect(StyleSheet.flatten(screen.getByTestId('onwall').props.style).backgroundColor).toBe(ink[900]);
  });

  it('takes its own locale for both the label and the casing', async () => {
    // App locale stays `en`; the pill was handed the surface's locale.
    await wrap(
      <>
        <StatusPill status="upcoming" locale="tr" />
        <StatusPill status="live" locale="tr" />
      </>
    );
    expect(screen.getByText('YAKLAŞAN')).toBeTruthy();
    // "Canlı" -> dotless ı must fold to a plain I, not to İ.
    expect(screen.getByText('CANLI')).toBeTruthy();
  });

  it('grows to 32px at size lg', async () => {
    await wrap(<StatusPill testID="pill" status="upcoming" size="lg" />);
    const s = StyleSheet.flatten(screen.getByTestId('pill').props.style);
    expect(s.height).toBe(32);
    expect(s.paddingHorizontal).toBe(14);
  });
});

describe('StatusPill — size="lg"', () => {
  // captionCaps is `700 11px/1.2`. The lg size overrides the 11px with 13px, so
  // it has to rescale the line height too: leaving the token's 13px behind puts
  // the caps on a ratio-1.0 line and clips their ascenders.
  it('keeps the captionCaps 1.2 ratio when it overrides the font size', () => {
    expect(LG_FONT_SIZE).toBe(13);
    expect(LG_LINE_HEIGHT).toBe(Math.round(13 * 1.2));
    expect(LG_LINE_HEIGHT).toBe(16);
  });

  it('renders 13/16, never 13/13', async () => {
    await wrap(<StatusPill testID="lg" status="live" size="lg" />);
    const style = StyleSheet.flatten(screen.getByText('LIVE').props.style) as {
      fontSize?: number;
      lineHeight?: number;
    };
    expect(style.fontSize).toBe(13);
    expect(style.lineHeight).toBe(16);
  });

  it('leaves the md pill on the captionCaps token', async () => {
    await wrap(<StatusPill testID="md" status="live" />);
    const style = StyleSheet.flatten(screen.getByText('LIVE').props.style) as {
      fontSize?: number;
      lineHeight?: number;
    };
    expect(style.fontSize).toBe(11);
    expect(style.lineHeight).toBe(Math.round(11 * 1.2));
  });
});
