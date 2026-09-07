/* eslint-disable @typescript-eslint/no-require-imports */
// Reanimated's jest helpers: install the mocked animation clock so
// withTiming/withRepeat resolve synchronously in tests.
try {
  require('react-native-reanimated').setUpTests();
} catch {
  // setUpTests is only present in dev builds of reanimated; the mock preset
  // still works without it.
}

// react-native-gesture-handler's own jest setup: mocks the native module so
// Gesture.Pan() and <GestureDetector> render in tests (patterns/Swipe).
require('react-native-gesture-handler/jestSetup');

// AsyncStorage has no native module under jest; the package ships its own
// in-memory mock (src/prefs reads and writes through it).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
