import { useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

/** Follow the conversation only while the reader is near its end. */
export function useConversationScroll(latest?: string) {
  const scroll = useRef<ScrollView>(null);
  const following = useRef(true);
  const seen = useRef(latest);
  const [showLatest, setShowLatest] = useState(false);
  const jump = () => {
    following.current = true;
    setShowLatest(false);
    scroll.current?.scrollToEnd({ animated: false });
  };
  const onScroll = ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
    following.current = e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y < 80;
    if (following.current) setShowLatest(false);
  };
  const onContentSizeChange = () => {
    if (following.current) scroll.current?.scrollToEnd({ animated: false });
    else if (latest !== seen.current) setShowLatest(true);
    seen.current = latest;
  };
  return { scroll, onScroll, onContentSizeChange, jump, showLatest };
}
