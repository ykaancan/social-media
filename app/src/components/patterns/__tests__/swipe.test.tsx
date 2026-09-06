import { configure, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text as RNText } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initI18n } from '../../../i18n';
import { EventColorProvider, ThemeProvider } from '../../../theme';
import { clampSwipe, Swipe, SWIPE_CLAMP, SWIPE_THRESHOLD, swipeDecision } from '../Swipe';

initI18n();
configure({ defaultIncludeHiddenElements: true });

function wrap(node: React.ReactNode) {
  return render(
    <GestureHandlerRootView>
      <ThemeProvider>
        <EventColorProvider>{node}</EventColorProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

describe('swipeDecision', () => {
  it('commits only past the 90px threshold', () => {
    expect(SWIPE_THRESHOLD).toBe(90);
    expect(swipeDecision(91)).toBe('approve');
    expect(swipeDecision(150)).toBe('approve');
    expect(swipeDecision(-91)).toBe('reject');
    expect(swipeDecision(-150)).toBe('reject');
  });

  it('does nothing at or inside the threshold — a short drag is not a decision', () => {
    expect(swipeDecision(0)).toBeNull();
    expect(swipeDecision(90)).toBeNull();
    expect(swipeDecision(-90)).toBeNull();
    expect(swipeDecision(8)).toBeNull();
    expect(swipeDecision(-8)).toBeNull();
  });
});

describe('clampSwipe', () => {
  it('clamps card travel to ±150px', () => {
    expect(SWIPE_CLAMP).toBe(150);
    expect(clampSwipe(0)).toBe(0);
    expect(clampSwipe(40)).toBe(40);
    expect(clampSwipe(400)).toBe(150);
    expect(clampSwipe(-400)).toBe(-150);
  });
});

describe('Swipe', () => {
  it('renders its child and both decision beds', async () => {
    await wrap(
      <Swipe testID="sw" onApprove={jest.fn()} onReject={jest.fn()}>
        <RNText>Shoutout to the kitchen crew</RNText>
      </Swipe>
    );
    expect(screen.getByText('Shoutout to the kitchen crew')).toBeTruthy();
    // The bed labels exist in the tree from the start; they are revealed by
    // opacity once the drag passes the threshold.
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
  });

  it('renders while disabled', async () => {
    await wrap(
      <Swipe testID="sw" disabled onApprove={jest.fn()} onReject={jest.fn()}>
        <RNText>x</RNText>
      </Swipe>
    );
    expect(screen.getByTestId('sw')).toBeTruthy();
  });
});
