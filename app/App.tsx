import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, {useEffect} from 'react';
import {getPref,PREF_KEYS} from './src/prefs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from './src/api';
import { ToastHost } from './src/components/patterns';
import Gallery from './src/dev/Gallery';
import { initI18n, setLocale } from './src/i18n';
import { RootNavigator } from './src/navigation';
import { SessionProvider } from './src/session';
import { EntitlementsProvider, EventColorProvider, fontAssets, ThemeProvider } from './src/theme';

initI18n();

/** Dev-only entry point override: `EXPO_PUBLIC_SCREEN=gallery expo start`. */
const showGallery = __DEV__ && process.env.EXPO_PUBLIC_SCREEN === 'gallery';

export default function App() {
  useEffect(()=>{void getPref(PREF_KEYS.locale).then(locale=>{if(locale==='en'||locale==='tr')void setLocale(locale);});},[]);
  const [fontsLoaded] = useFonts(fontAssets);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <EventColorProvider>
            <EntitlementsProvider>
              <ApiProvider>
                <SessionProvider>
                  <ToastHost>
                    {/* Render nothing until the self-hosted faces are in: RN would
                        otherwise lay out with the system font and reflow. */}
                    {!fontsLoaded ? null : showGallery ? <Gallery /> : <RootNavigator />}
                    <StatusBar style="auto" />
                  </ToastHost>
                </SessionProvider>
              </ApiProvider>
            </EntitlementsProvider>
          </EventColorProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
