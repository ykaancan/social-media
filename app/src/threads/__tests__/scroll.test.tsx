import { act, renderHook } from '@testing-library/react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { useConversationScroll } from '../useConversationScroll';

it('keeps history in place on incoming messages and follows after an explicit jump or own send', async () => {
  const { result, rerender } = await renderHook<ReturnType<typeof useConversationScroll>, { latest: string }>(({ latest }) => useConversationScroll(latest), { initialProps: { latest: 'one' } });
  const scrollToEnd = jest.fn();
  result.current.scroll.current = { scrollToEnd } as unknown as ScrollView;
  await act(() => result.current.onContentSizeChange());
  expect(scrollToEnd).toHaveBeenCalledTimes(1);
  await act(() => result.current.onScroll({ nativeEvent: { contentSize: { height: 2000 }, layoutMeasurement: { height: 500 }, contentOffset: { y: 200 } } } as NativeSyntheticEvent<NativeScrollEvent>));
  await rerender({ latest: 'two' });
  await act(() => result.current.onContentSizeChange());
  expect(scrollToEnd).toHaveBeenCalledTimes(1);
  expect(result.current.showLatest).toBe(true);
  await act(() => result.current.jump());
  expect(result.current.showLatest).toBe(false);
  await rerender({ latest: 'three' });
  await act(() => result.current.onContentSizeChange());
  expect(scrollToEnd).toHaveBeenCalledTimes(3);
});
