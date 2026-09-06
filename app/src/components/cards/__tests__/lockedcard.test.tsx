import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { initI18n } from '../../../i18n';
import { EntitlementsProvider, EventColorProvider, ThemeProvider } from '../../../theme';
import { LockedCard, lockedLineWidths } from '../LockedCard';
import { hatchRotation } from './svgHatch';

/** Lays the bars out against a known content width. */
async function measure(testID: string, width: number) {
  await fireEvent(screen.getByTestId(testID), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
  });
}

initI18n();
configure({ defaultIncludeHiddenElements: true });

function wrap(node: React.ReactNode, lockedCards = false) {
  return render(
    <ThemeProvider>
      <EntitlementsProvider value={{ lockedCards }}>
        <EventColorProvider>{node}</EventColorProvider>
      </EntitlementsProvider>
    </ThemeProvider>
  );
}

describe('lockedLineWidths — the honesty maths', () => {
  it('derives the line count from the REAL character length, capped at 6', () => {
    // n = clamp(ceil(length / 42), 1, 6)
    expect(lockedLineWidths(1)).toHaveLength(1);
    expect(lockedLineWidths(42)).toHaveLength(1);
    expect(lockedLineWidths(43)).toHaveLength(2);
    expect(lockedLineWidths(164)).toHaveLength(4);
    expect(lockedLineWidths(252)).toHaveLength(6);
    expect(lockedLineWidths(10000)).toHaveLength(6);
  });

  it('makes every line full width except the last', () => {
    // 164 % 42 = 38 -> round(38/42*100) = 90
    expect(lockedLineWidths(164)).toEqual([100, 100, 100, 90]);
    // 41 % 42 = 41 -> round(41/42*100) = 98
    expect(lockedLineWidths(41)).toEqual([98]);
    // an exact multiple falls back to a full last line
    expect(lockedLineWidths(84)).toEqual([100, 100]);
  });

  it('never lets the last line fall below 18%', () => {
    // 43 % 42 = 1 -> round(1/42*100) = 2, floored at 18
    expect(lockedLineWidths(43)).toEqual([100, 18]);
  });
});

describe('LockedCard — [D3] gate OFF (stage 1 default)', () => {
  it('renders as an ordinary card: no lock badge, no bars, no Unlock button', async () => {
    await wrap(
      <LockedCard
        testID="lc"
        level="hint"
        hints={{ country: 'Italy' }}
        text="okay your playlist carried the whole bus home"
        time="3h"
        source="National Platform"
      />
    );
    expect(screen.queryByTestId('lc-bars')).toBeNull();
    expect(screen.queryByText('Unlock')).toBeNull();
    expect(screen.queryByLabelText('Locked')).toBeNull();
    // …and no character-count meta line: it is a plain post card.
    expect(screen.queryByText('characters')).toBeNull();
    // the message and its metadata still read normally
    expect(screen.getByText('okay your playlist carried the whole bus home')).toBeTruthy();
    expect(screen.getByText('From National Platform')).toBeTruthy();
    expect(screen.getByText('3h')).toBeTruthy();
  });

  it('still renders the children slot the inbox passes its actions through', async () => {
    await wrap(
      <LockedCard text="hey" length={3}>
        <></>
      </LockedCard>
    );
    expect(screen.getByText('hey')).toBeTruthy();
  });
});

const UNLOCKED_TEXT = 'okay your playlist carried the whole bus home';

describe('LockedCard — gate ON', () => {
  it('locks: blurred bars, real metadata, and the Unlock CTA', async () => {
    const onUnlock = jest.fn();
    await wrap(
      <LockedCard
        testID="lc"
        level="hint"
        hints={{ country: 'Italy' }}
        length={164}
        time="3h"
        source="National Platform"
        onUnlock={onUnlock}
      />,
      true
    );
    expect(screen.getByTestId('lc-bars')).toBeTruthy();
    expect(screen.getByLabelText('Locked')).toBeTruthy();
    // metadata is REAL: the true character count and the true source
    expect(screen.getByText('164')).toBeTruthy();
    expect(screen.getByText(/characters/)).toBeTruthy();
    expect(screen.getByText('National Platform')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('lc-unlock'));
    expect(onUnlock).toHaveBeenCalled();
  });

  it('unlocked: readable text, no bars, no Unlock button — the slot stays reserved', async () => {
    await wrap(
      <LockedCard
        testID="lc"
        unlocked
        level="anonymous"
        text={UNLOCKED_TEXT}
        time="5h"
        source="National Platform 2026"
      />,
      true
    );
    expect(screen.queryByTestId('lc-bars')).toBeNull();
    expect(screen.queryByTestId('lc-unlock')).toBeNull();
    expect(screen.queryByLabelText('Locked')).toBeNull();
    expect(screen.getByText(UNLOCKED_TEXT)).toBeTruthy();
    // length still defaults to the real text length — never a rounded stand-in
    expect(screen.getByText(String(UNLOCKED_TEXT.length))).toBeTruthy();
  });

  it('falls back to 120 characters when neither length nor text is known', async () => {
    await wrap(<LockedCard testID="lc" />, true);
    expect(screen.getByText('120')).toBeTruthy();
  });
});

describe('LockedCard — the blurred bars measure the CONTENT width', () => {
  // The canvas is inflated on every side so the blur is not clipped, so an SVG
  // `width="100%"` would resolve against the PADDED box and overrun the card.
  it('gives a 100% bar exactly the measured content width, and the last bar its share', async () => {
    await wrap(<LockedCard testID="lc" length={164} />, true);
    await measure('lc-bars', 300);
    // 164 -> [100, 100, 100, 90]
    expect(screen.getByTestId('lc-bars-0').props.width).toBe(300);
    expect(screen.getByTestId('lc-bars-1').props.width).toBe(300);
    expect(screen.getByTestId('lc-bars-3').props.width).toBe(270);
  });

  it('offsets every bar by the blur padding, equally on both axes', async () => {
    await wrap(<LockedCard testID="lc" length={41} />, true);
    await measure('lc-bars', 240);
    const first = screen.getByTestId('lc-bars-0');
    // x is the pad; y is the pad plus zero rows. Same number, so the canvas is
    // inflated symmetrically and the bleed is never clipped on the left.
    expect(first.props.x).toBeGreaterThan(0);
    expect(first.props.y).toBe(first.props.x);
    // 41 -> [98]
    expect(first.props.width).toBeCloseTo(0.98 * 240);
  });

  it('draws no bars at all until it has been measured', async () => {
    await wrap(<LockedCard testID="lc" length={164} />, true);
    expect(screen.getByTestId('lc-bars')).toBeTruthy();
    expect(screen.queryByTestId('lc-bars-0')).toBeNull();
  });
});

describe('LockedCard — the hatch angle', () => {
  // CSS `repeating-linear-gradient(θ)` lays stripes PERPENDICULAR to θ, so a
  // vertical-stripe SVG pattern has to be rotated by θ − 90. The locked hatch
  // is 135deg, hence 45.
  it('rotates the vertical-stripe pattern to 135 − 90 = 45', async () => {
    await wrap(<LockedCard testID="lc" length={41} />, true);
    expect(hatchRotation(screen.toJSON())).toBe(45);
  });
});

describe('LockedCard — [D3] gate OFF with no text', () => {
  // Stage 1 always ships `text`; `length` alone is a locked-only input. If a
  // caller passes only `length` the card must still say something true.
  it('never renders a blank body: the real meta line stands in for it', async () => {
    await wrap(
      <LockedCard
        testID="lc"
        level="hint"
        hints={{ country: 'Italy' }}
        length={164}
        time="3h"
        source="National Platform"
      />
    );
    expect(screen.getByText('164 characters · from someone at National Platform')).toBeTruthy();
    // …and the header is intact: level, time, source.
    expect(screen.getByText('3h')).toBeTruthy();
    expect(screen.getByText('From National Platform')).toBeTruthy();
    expect(screen.getByText('Italy')).toBeTruthy();
    // still an ordinary card — no bars, no lock badge, no Unlock CTA
    expect(screen.queryByTestId('lc-bars')).toBeNull();
    expect(screen.queryByLabelText('Locked')).toBeNull();
  });

  it('drops the source clause when the message has no source', async () => {
    await wrap(<LockedCard testID="lc" length={41} time="5h" />);
    expect(screen.getByText('41 characters')).toBeTruthy();
  });

  it('prefers the real text whenever there is one', async () => {
    await wrap(<LockedCard testID="lc" length={164} text="short body" source="National Platform" />);
    expect(screen.getByText('short body')).toBeTruthy();
    expect(screen.queryByText(/164 characters/)).toBeNull();
  });
});
