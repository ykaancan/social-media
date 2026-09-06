import { configure, render, screen } from '@testing-library/react-native';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initI18n } from '../../i18n';
import { EntitlementsProvider, EventColorProvider, ThemeProvider } from '../../theme';
import Gallery from '../Gallery';
import { CAPTION_TEST_ID } from '../kit';

initI18n();

// Sheets and the scroller start their entrance at opacity 0 and reanimated's
// jest mock never advances it, so RNTL would treat their bodies as hidden.
configure({ defaultIncludeHiddenElements: true });

/**
 * The number of `<span className="lbl">` captions in the four web specimens:
 *   core.card.html 0 · anonymity.card.html 4 · cards.card.html 13 · projector 0
 * The RN gallery adds captions to the rows the web cards leave unlabelled, and
 * one per pattern, so the total is asserted exactly rather than as a floor.
 */
const WEB_LBL_CAPTIONS = 17;
const CAPTIONS = {
  core: 13,
  anonymity: 6,
  cards: 13,
  projector: 1,
  // +2: the [D1] MoreSheet thread variant, which the web has as thread-app.jsx's
  // overflow sheet rather than a card specimen.
  patterns: 36,
};
const TOTAL_CAPTIONS = Object.values(CAPTIONS).reduce((a, b) => a + b, 0);

/** App.tsx's provider stack minus `useFonts` — the faces are irrelevant here. */
function renderGallery() {
  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ThemeProvider>
          <EventColorProvider>
            <EntitlementsProvider>
              <Gallery />
            </EntitlementsProvider>
          </EventColorProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

describe('dev component gallery', () => {
  it('renders every section heading', async () => {
    await renderGallery();
    // The jump chips repeat every heading's label, so match on the heading node.
    const headings: Record<string, string> = {
      core: 'Core',
      anonymity: 'Anonymity',
      cards: 'Cards',
      projector: 'Projector',
      patterns: 'Patterns',
    };
    for (const [id, label] of Object.entries(headings)) {
      expect(screen.getByTestId(`gallery-section-${id}`).props.children).toBe(label);
    }
  });

  it('renders one caption per specimen, covering every web `lbl`', async () => {
    await renderGallery();
    // The control bar reuses Caption for its own labels; they are not specimens.
    const barCaptions = 4; // locale · event · locked gate · reduced motion
    const captions = screen.getAllByTestId(CAPTION_TEST_ID);
    expect(captions).toHaveLength(TOTAL_CAPTIONS + barCaptions);
    expect(TOTAL_CAPTIONS).toBeGreaterThanOrEqual(WEB_LBL_CAPTIONS);
    expect(TOTAL_CAPTIONS).toBe(69);
  });

  it('mirrors the web specimens the captions are copied from', async () => {
    await renderGallery();
    for (const label of [
      'PostCard · board',
      'PostCard · inbox',
      'PostCard · wall',
      'LockedCard · length 164 / 41 (gate OFF: ordinary cards)',
      'QueueCard · selectable',
      'anonymous',
      'hint',
      'named',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('carries the control bar: locale, event colour, locked gate, reduced motion, jump chips', async () => {
    await renderGallery();
    expect(screen.getByText('Component gallery')).toBeTruthy();
    expect(screen.getByText('en')).toBeTruthy();
    expect(screen.getByText('tr')).toBeTruthy();
    for (const name of ['magenta', 'coral', 'tangerine', 'amber', 'lime', 'mint', 'azure', 'violet']) {
      expect(screen.getByTestId(`gallery-cover-${name}`)).toBeTruthy();
    }
    expect(screen.getByTestId('gallery-scroll')).toBeTruthy();
  });
});
