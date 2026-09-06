import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { initI18n } from '../../../i18n';
import { EventColorProvider, ink, palette, ThemeProvider } from '../../../theme';
import { Chip } from '../Chip';

initI18n();

function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider>{node}</EventColorProvider>
    </ThemeProvider>
  );
}

const colors = palette('app');

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

describe('Chip', () => {
  it('is a muted pill with a transparent 1.5px border by default', async () => {
    await wrap(
      <Chip testID="chip" icon="MapPin">
        ESN Ankara · Türkiye
      </Chip>
    );
    const s = styleOf('chip');
    expect(s.backgroundColor).toBe(colors.surfaceMuted);
    expect(s.borderColor).toBe('transparent');
    expect(s.borderWidth).toBe(1.5);
    expect(s.height).toBe(32);
    expect(screen.getByText('ESN Ankara · Türkiye')).toBeTruthy();
  });

  it('inverts to primary/on-primary when selected', async () => {
    await wrap(
      <Chip testID="chip" selected>
        Section
      </Chip>
    );
    const s = styleOf('chip');
    expect(s.backgroundColor).toBe(colors.primary);
    expect(s.borderColor).toBe(colors.primary);
  });

  it('draws the outline tone as a bordered transparent pill', async () => {
    await wrap(
      <Chip testID="chip" tone="outline">
        Country
      </Chip>
    );
    const s = styleOf('chip');
    expect(s.backgroundColor).toBe('transparent');
    expect(s.borderColor).toBe(ink[200]);
  });

  it('tints the live tone', async () => {
    await wrap(
      <Chip testID="chip" tone="live">
        Live
      </Chip>
    );
    expect(styleOf('chip').backgroundColor).toBe(colors.liveSoft);
  });

  it('shrinks to 26px at size sm', async () => {
    await wrap(
      <Chip testID="chip" size="sm">
        First letter
      </Chip>
    );
    const s = styleOf('chip');
    expect(s.height).toBe(26);
    expect(s.paddingHorizontal).toBe(10);
  });

  it('becomes a button that reports its selected state when onPress is given', async () => {
    const onPress = jest.fn();
    await wrap(
      <Chip testID="chip" selected onPress={onPress}>
        Section
      </Chip>
    );
    const chip = screen.getByTestId('chip');
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
