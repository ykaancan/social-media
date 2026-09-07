import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { ThemeProvider } from '../../../theme';
import { ToastHost, useToast } from '../ToastHost';

function Trigger({ action, onAction }: { action?: string; onAction?: () => void }) {
  const toast = useToast();
  return (
    <Pressable testID="trigger" onPress={() => toast.show('Sent', { action, onAction })}>
      <Text>go</Text>
    </Pressable>
  );
}

const mount = (props: React.ComponentProps<typeof Trigger> = {}) =>
  render(
    <ThemeProvider>
      <ToastHost>
        <Trigger {...props} />
      </ToastHost>
    </ThemeProvider>
  );

describe('ToastHost', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows one toast and clears it after 2.6 s', async () => {
    await mount();
    expect(screen.queryByTestId('toast')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('trigger'));
    });
    expect(screen.getByText('Sent')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2599);
    });
    expect(screen.getByText('Sent')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('runs the action and hides', async () => {
    const onAction = jest.fn();
    await mount({ action: 'View', onAction });
    await act(async () => {
      fireEvent.press(screen.getByTestId('trigger'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('View'));
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
