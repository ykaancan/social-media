import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getPref, PREF_KEYS, removePref, setPref, useCoachMark } from '../index';

/**
 * The preference store, against the package's own in-memory jest mock (wired in
 * `jest.setup.js`). Two things are worth proving: an unset key reads as null,
 * and a storage that throws never reaches the UI.
 */

const KEY = PREF_KEYS.coachMarkDismissed;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

test('an unset preference reads as null', async () => {
  expect(await getPref(KEY)).toBeNull();
});

test('set, read back, remove', async () => {
  await setPref(KEY, '1');
  expect(await getPref(KEY)).toBe('1');

  await removePref(KEY);
  expect(await getPref(KEY)).toBeNull();
});

test('keys are namespaced, so nothing else in AsyncStorage can collide', async () => {
  await setPref(KEY, '1');
  expect(await AsyncStorage.getItem('brand.pref.coachMark.dismissed')).toBe('1');
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
});

test('a storage that throws is swallowed: a read fails to "not set", a write to nothing', async () => {
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk is full'));
  await expect(getPref(KEY)).resolves.toBeNull();

  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk is full'));
  await expect(setPref(KEY, '1')).resolves.toBeUndefined();

  jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk is full'));
  await expect(removePref(KEY)).resolves.toBeUndefined();
});

describe('useCoachMark', () => {
  it('resolves to visible when the key was never set, and hides on dismiss', async () => {
    const { result } = await renderHook(() => useCoachMark());

    // `null` until the read lands: a dismissed mark must never flash.
    await waitFor(() => expect(result.current.visible).toBe(true));

    await act(async () => {
      result.current.dismiss();
    });

    expect(result.current.visible).toBe(false);
    await waitFor(async () => expect(await getPref(KEY)).not.toBeNull());
  });

  it('stays hidden on the next launch', async () => {
    await setPref(KEY, '1');
    const { result } = await renderHook(() => useCoachMark());

    await waitFor(() => expect(result.current.visible).toBe(false));
  });
});
