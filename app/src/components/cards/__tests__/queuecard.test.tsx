import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { initI18n } from '../../../i18n';
import { EventColorProvider, ink, palette, ThemeProvider } from '../../../theme';
import { QueueCard } from '../QueueCard';

initI18n();
// post-in starts at opacity 0 under the reanimated mock.
configure({ defaultIncludeHiddenElements: true });

const colors = palette('app');

function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider>{node}</EventColorProvider>
    </ThemeProvider>
  );
}

describe('QueueCard', () => {
  it('renders the index, sender and body', async () => {
    await wrap(
      <QueueCard
        testID="q"
        index={3}
        text="Shoutout to the kitchen crew, dinner was unreal"
        sender={{ level: 'anonymous' }}
        time="12s"
      />
    );
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Shoutout to the kitchen crew, dinner was unreal')).toBeTruthy();
    expect(screen.getByText('12s')).toBeTruthy();
    expect(screen.getByLabelText('Anonymous')).toBeTruthy();
  });

  it('calls onApprove and onReject from the one-thumb action row', async () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();
    await wrap(<QueueCard testID="q" text="x" onApprove={onApprove} onReject={onReject} />);
    await fireEvent.press(screen.getByTestId('q-approve'));
    expect(onApprove).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('q-reject'));
    expect(onReject).toHaveBeenCalled();
  });

  it('makes Approve the only green button, with the reject target in danger-soft', async () => {
    await wrap(<QueueCard testID="q" text="x" onApprove={jest.fn()} onReject={jest.fn()} />);
    const inner = (testID: string) =>
      StyleSheet.flatten(
        (screen.getByTestId(testID).children[0] as { props: { style?: unknown } }).props
          .style as ViewStyle
      );
    expect(inner('q-approve').backgroundColor).toBe(colors.live);
    expect(inner('q-reject').backgroundColor).toBe(colors.dangerSoft);
    // the label is on Approve only — Reject is icon-only, at 56px
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.queryByText('Reject')).toBeNull();
    expect(screen.getByLabelText('Reject')).toBeTruthy();
  });

  it('[D8] offers no un-reject affordance in any state', async () => {
    await wrap(
      <>
        {(['pending', 'approved', 'rejected'] as const).map((state) => (
          <QueueCard
            key={state}
            testID={`q-${state}`}
            text="x"
            state={state}
            onApprove={jest.fn()}
            onReject={jest.fn()}
          />
        ))}
      </>
    );
    // Nothing that could take a rejection back: no undo, no restore, no
    // "un-reject" control on a card that has already been rejected. Recovery
    // is the 5-second toast, outside this component.
    expect(screen.queryByLabelText(/undo|restore|un-?reject/i)).toBeNull();
    expect(screen.queryByText(/undo|restore|un-?reject/i)).toBeNull();
    // …and a rejected card keeps exactly the two decision targets it had.
    expect(screen.getByTestId('q-rejected-approve')).toBeTruthy();
    expect(screen.getByTestId('q-rejected-reject')).toBeTruthy();
  });

  it('selectable: swaps the action row for a check circle and toggles', async () => {
    const onSelect = jest.fn();
    await wrap(
      <QueueCard
        testID="q"
        index={4}
        text="Bus back to the hotel leaves at 02:00 sharp"
        sender={{ level: 'named', name: 'Ece Kara' }}
        selectable
        onSelect={onSelect}
      />
    );
    expect(screen.queryByTestId('q-approve')).toBeNull();
    expect(screen.queryByTestId('q-reject')).toBeNull();
    expect(screen.getByTestId('q-check')).toBeTruthy();
    // the whole card is the toggle
    await fireEvent.press(screen.getByTestId('q'));
    expect(onSelect).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('q-check'));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('selected: fills the check circle and rings the card in ink-900', async () => {
    await wrap(<QueueCard testID="q" text="x" selectable selected />);
    const check = StyleSheet.flatten(screen.getByTestId('q-check').props.style as ViewStyle);
    expect(check.backgroundColor).toBe(ink[900]);
    expect(check.borderColor).toBe(ink[900]);
    const card = StyleSheet.flatten(
      (screen.getByTestId('q').children[0] as { props: { style?: unknown } }).props
        .style as ViewStyle
    );
    expect(card.borderWidth).toBe(2);
    expect(card.borderColor).toBe(ink[900]);
    // padding compensated so nothing shifts when it becomes selected
    expect(card.paddingHorizontal).toBe(15);
  });
});
