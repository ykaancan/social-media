import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { initI18n } from '../../../i18n';
import { EventColorProvider, palette, ThemeProvider } from '../../../theme';
import { formatJoinCode, JoinCodeBlock } from '../JoinCodeBlock';
import { hatchRotation } from './svgHatch';
import { PendingState } from '../PendingState';
import { ThreadBubble } from '../ThreadBubble';

initI18n();

function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider>{node}</EventColorProvider>
    </ThemeProvider>
  );
}

const colors = palette('app');

describe('ThreadBubble', () => {
  it('[D5] renders each bubble at the level ITS OWN message was sent at', async () => {
    // Same author, two messages, one sent before a reveal and one after. The
    // participant's current level must never rewrite the earlier bubble.
    await wrap(
      <>
        <ThreadBubble text="hey, that one was about you 👀" sender={{ level: 'hint', hints: { letter: 'Deniz' } }} time="22:14" />
        <ThreadBubble text="ok fine it was me" sender={{ level: 'named', name: 'Deniz Aksoy' }} time="22:16" />
      </>
    );
    // the first bubble still shows only a clue…
    expect(screen.getByTestId('hint-chip-letter').props.children).toBe('D');
    // …while the second shows the name
    expect(screen.getByText('Deniz Aksoy')).toBeTruthy();
    expect(screen.getByText('hey, that one was about you 👀')).toBeTruthy();
    expect(screen.getByText('ok fine it was me')).toBeTruthy();
  });

  it('never shows a sender badge on my own bubble', async () => {
    await wrap(<ThreadBubble text="who is this??" mine sender={{ level: 'named', name: 'Deniz Aksoy' }} time="22:15" />);
    expect(screen.queryByText('Deniz Aksoy')).toBeNull();
  });

  it('renders my bubble in the primary colour and theirs muted', async () => {
    await wrap(
      <>
        <ThreadBubble testID="mine" text="who is this??" mine />
        <ThreadBubble testID="theirs" text="hey" />
      </>
    );
    const mine = StyleSheet.flatten(screen.getByTestId('mine').props.style);
    expect(mine.alignSelf).toBe('flex-end');
    expect(StyleSheet.flatten(screen.getByTestId('theirs').props.style).alignSelf).toBeUndefined();
  });

  it('centres a system line and gives it no badge', async () => {
    await wrap(
      <ThreadBubble
        testID="sys"
        system
        text="Deniz revealed themselves"
        sender={{ level: 'named', name: 'Deniz Aksoy' }}
      />
    );
    expect(screen.getByText('Deniz revealed themselves')).toBeTruthy();
    expect(screen.queryByText('Deniz Aksoy')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('sys').props.style).alignSelf).toBe('center');
  });
});

describe('PendingState', () => {
  const steps = [
    { label: 'Profile sent', done: true },
    { label: 'Admin review', current: true, description: 'Usually within a day' },
    { label: "You're in" },
  ];

  it('ticks a done step, pulses the current one and numbers the rest', async () => {
    await wrap(
      <PendingState
        title="You're in the queue"
        subtitle="An admin checks every profile by hand, so everyone here is real."
        steps={steps}
        note="We'll let you know. Nothing to do until then."
      />
    );

    expect(screen.getByText("YOU'RE IN THE QUEUE")).toBeTruthy();

    // done: filled dot, a check instead of its number
    const done = StyleSheet.flatten(screen.getByTestId('pending-step-0-dot').props.style);
    expect(done.backgroundColor).toBe(colors.text);
    expect(screen.queryByText('1')).toBeNull();
    expect(screen.queryByTestId('pending-step-0-pulse')).toBeNull();

    // current: pulsing ring, outlined dot on the page background
    expect(screen.getByTestId('pending-step-1-pulse')).toBeTruthy();
    const current = StyleSheet.flatten(screen.getByTestId('pending-step-1-dot').props.style);
    expect(current.backgroundColor).toBe(colors.bg);
    expect(current.borderColor).toBe(colors.text);
    expect(screen.getByText('2')).toBeTruthy();

    // upcoming: muted dot, still numbered
    const upcoming = StyleSheet.flatten(screen.getByTestId('pending-step-2-dot').props.style);
    expect(upcoming.backgroundColor).toBe(colors.surfaceMuted);
    expect(screen.getByText('3')).toBeTruthy();

    expect(screen.getByText('Usually within a day')).toBeTruthy();
    expect(screen.getByText("We'll let you know. Nothing to do until then.")).toBeTruthy();
  });
});

describe('JoinCodeBlock', () => {
  it('groups the code in threes', () => {
    expect(formatJoinCode('K7Q4ZM')).toBe('K7Q 4ZM');
  });

  it('strips everything that is not A-Z0-9 and uppercases', () => {
    expect(formatJoinCode('k7q-4zm!')).toBe('K7Q 4ZM');
    expect(formatJoinCode(' k7 q4z m ')).toBe('K7Q 4ZM');
  });

  it('renders the code, the QR placeholder and both actions', async () => {
    await wrap(<JoinCodeBlock code="k7q4zm" />);
    expect(screen.getByTestId('join-code').props.children).toBe('K7Q 4ZM');
    expect(screen.getByText('JOIN CODE')).toBeTruthy();
    expect(screen.getByText('QR code')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
  });

  it('takes the soft event tint from the prop when given', async () => {
    await wrap(<JoinCodeBlock testID="jc" code="K7Q4ZM" eventColorSoft="#e0f2ff" />);
    expect(StyleSheet.flatten(screen.getByTestId('jc').props.style).backgroundColor).toBe('#e0f2ff');
  });
});

describe('JoinCodeBlock — the QR placeholder hatch angle', () => {
  // A CSS `repeating-linear-gradient(θ)` lays its stripes PERPENDICULAR to θ, so
  // the vertical-stripe SVG pattern has to be rotated by θ − 90. The web is
  // `repeating-linear-gradient(45deg, …)`, so the pattern is at −45 — stripes
  // running top-left to bottom-right, not the mirror image.
  it('rotates the vertical-stripe pattern to 45 − 90 = −45', async () => {
    await wrap(<JoinCodeBlock code="K7Q4ZM" />);
    expect(hatchRotation(screen.toJSON())).toBe(-45);
  });
});
