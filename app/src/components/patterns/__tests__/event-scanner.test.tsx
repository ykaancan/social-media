import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { EventScanner } from '../EventScanner';
import { ThemeProvider } from '../../../theme';
import { initI18n } from '../../../i18n';

let mockPermission = { granted: true, canAskAgain: true };
const mockRequestPermission = jest.fn().mockResolvedValue({ granted: true });
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
  CameraView: (props: object) => require('react').createElement(require('react-native').View, { ...props, testID: 'camera' }),
}));
initI18n();
beforeEach(() => { mockPermission = { granted: true, canAskAgain: true }; mockRequestPermission.mockClear(); });

it('accepts a full event code once and does not extract a code from unrelated QR content', async () => {
  const onCode = jest.fn();
  await render(<ThemeProvider><EventScanner onCode={onCode} /></ThemeProvider>);
  await act(async () => { fireEvent(screen.getByTestId('camera'), 'barcodeScanned', { data: 'https://unrelated.example/K7Q4ZM' }); });
  expect(onCode).not.toHaveBeenCalled();
  await act(async () => { fireEvent(screen.getByTestId('camera'), 'barcodeScanned', { data: 'k7q-4zm' }); });
  await act(async () => { fireEvent(screen.getByTestId('camera'), 'barcodeScanned', { data: 'K7Q4ZM' }); });
  expect(onCode).toHaveBeenCalledTimes(1);
  expect(onCode).toHaveBeenCalledWith('K7Q4ZM');
});

it('does not mount a camera before permission and requests permission only on tap', async () => {
  mockPermission = { granted: false, canAskAgain: true };
  await render(<ThemeProvider><EventScanner onCode={jest.fn()} /></ThemeProvider>);
  expect(screen.queryByTestId('camera')).toBeNull();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByText('Allow camera')); });
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
});
