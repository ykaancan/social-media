import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Gallery from './src/dev/Gallery';
import { initI18n } from './src/i18n';
import { EntitlementsProvider, EventColorProvider, fontAssets, ThemeProvider } from './src/theme';

initI18n();

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <EventColorProvider>
            <EntitlementsProvider>
              {/* Render nothing until the self-hosted faces are in: RN would
                  otherwise lay out with the system font and reflow. */}
              {!fontsLoaded ? null : __DEV__ ? <Gallery /> : <View style={{ flex: 1 }} />}
              <StatusBar style="auto" />
            </EntitlementsProvider>
          </EventColorProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
