import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DEFAULT_LOCALE, initI18n, setLocale, t as translate } from '../../../i18n';
import { covers, coverNames, palette, ThemeProvider } from '../../../theme';
import { upper } from '../../../utils/text';
import { BottomBar, CoachMark, CoverStrip, PhotoPicker, PickerRow, Screen, Wordmark } from '../index';

initI18n();

// CoverStrip hides itself from assistive tech (it is pure ornament), which is
// exactly what RNTL treats as "hidden" — same reason the gallery test does this.
configure({ defaultIncludeHiddenElements: true });

const colors = palette('app');

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrap(node: React.ReactNode) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Same trick as rows-nav.test.tsx: RNTL 14 has no query-by-type and Icon takes
 * no testID, so a glyph is identified by the SVG path data it renders. Never
 * call unmount() in this file.
 */
function paths(node: unknown): string[] {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(paths);
  const n = node as { props?: Record<string, unknown>; children?: unknown[] };
  const out: string[] = [];
  if (typeof n.props?.d === 'string') out.push(n.props.d);
  for (const child of n.children ?? []) out.push(...paths(child));
  return out;
}

/** lucide path data, read off the installed package (see core/__tests__/Icon.test.ts). */
const LOCK = 'M7 11V7a5 5 0 0 1 10 0v4';
const CHEVRON_DOWN = 'm6 9 6 6 6-6';
const PLUS = 'M5 12h14';
const PENCIL = 'm15 5 4 4';
const CAMERA =
  'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z';

function flat(el: { props: { style?: unknown } }): ViewStyle {
  return (StyleSheet.flatten(el.props.style as ViewStyle) ?? {}) as ViewStyle;
}

/** Text styles arrive as an array; flatten before reading a single property. */
function textStyle(el: { props: { style?: unknown } }): TextStyle {
  return (StyleSheet.flatten(el.props.style as TextStyle) ?? {}) as TextStyle;
}

afterEach(async () => {
  await setLocale(DEFAULT_LOCALE);
});

describe('PickerRow', () => {
  const editable = {
    label: 'Your section',
    icon: 'MapPin' as const,
    placeholder: 'Pick your section',
  };

  it('shows the placeholder in text-3 and the value in text', async () => {
    await wrap(<PickerRow {...editable} testID="empty" />);
    expect(textStyle(screen.getByText('Pick your section')).color).toBe(colors.text3);

    await wrap(<PickerRow {...editable} value="ESN Ankara" testID="filled" />);
    expect(textStyle(screen.getByText('ESN Ankara')).color).toBe(colors.text);
  });

  it('truncates a long value to one line', async () => {
    await wrap(<PickerRow {...editable} value="ESN Boğaziçi İstanbul" />);
    expect(screen.getByText('ESN Boğaziçi İstanbul').props.numberOfLines).toBe(1);
  });

  it('is a pressable, chevroned, bordered field when editable', async () => {
    const onPress = jest.fn();
    const view = await wrap(<PickerRow {...editable} onPress={onPress} testID="row" />);
    const field = screen.getByTestId('row-field');
    expect(field.props.accessibilityRole).toBe('button');
    await fireEvent.press(field);
    expect(onPress).toHaveBeenCalledTimes(1);

    const drawn = paths(view.toJSON());
    expect(drawn).toContain(CHEVRON_DOWN);
    expect(drawn).not.toContain(LOCK);
  });

  it('[D11] locked is not pressable and drops the border for surface-muted', async () => {
    const onPress = jest.fn();
    await wrap(
      <PickerRow
        locked
        label="Country"
        icon="Flag"
        value="Türkiye"
        placeholder="Filled from your section"
        onPress={onPress}
        testID="locked"
      />
    );
    const field = screen.getByTestId('locked-field');
    expect(field.props.accessibilityRole).toBeUndefined();
    expect(screen.queryByRole('button')).toBeNull();
    expect(onPress).not.toHaveBeenCalled();

    const style = flat(field);
    expect(style.backgroundColor).toBe(colors.surfaceMuted);
    expect(style.borderWidth).toBeUndefined();
  });

  it('[D11] locked shows the Lock only once there is a value, and never a chevron', async () => {
    const empty = await wrap(
      <PickerRow locked label="Country" icon="Flag" placeholder="Filled from your section" />
    );
    const emptyPaths = paths(empty.toJSON());
    expect(emptyPaths).not.toContain(LOCK);
    expect(emptyPaths).not.toContain(CHEVRON_DOWN);

    const filled = await wrap(
      <PickerRow locked label="Country" icon="Flag" value="Türkiye" placeholder="Filled from your section" />
    );
    const filledPaths = paths(filled.toJSON());
    expect(filledPaths).toContain(LOCK);
    expect(filledPaths).not.toContain(CHEVRON_DOWN);
  });
});

describe('PhotoPicker', () => {
  it('empty: dashed Camera circle with the Plus badge', async () => {
    const view = await wrap(
      <PhotoPicker label="Photo" hint="Real face, please." onPress={() => {}} testID="photo" />
    );
    const drawn = paths(view.toJSON());
    expect(drawn).toContain(CAMERA);
    expect(drawn).toContain(PLUS);
    expect(drawn).not.toContain(PENCIL);
    expect(screen.getByText('Photo')).toBeTruthy();
    expect(screen.getByText('Real face, please.')).toBeTruthy();
  });

  it('with a photo: the badge swaps to Pencil and the Camera goes', async () => {
    const view = await wrap(
      <PhotoPicker uri="file:///tmp/me.jpg" name="Deniz Aksoy" label="Photo" onPress={() => {}} />
    );
    const drawn = paths(view.toJSON());
    expect(drawn).toContain(PENCIL);
    expect(drawn).not.toContain(PLUS);
    expect(drawn).not.toContain(CAMERA);
  });

  it('hands the tap to the screen, which owns the OS picker', async () => {
    const onPress = jest.fn();
    await wrap(<PhotoPicker label="Photo" onPress={onPress} testID="p" />);
    await fireEvent.press(screen.getByTestId('p-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('CoverStrip', () => {
  it('renders the eight covers in the canonical order', async () => {
    await wrap(<CoverStrip testID="strip" />);
    const bars = screen.getByTestId('strip').children as { props: { style?: unknown } }[];
    expect(bars).toHaveLength(8);
    expect(bars.map((bar) => flat(bar).backgroundColor)).toEqual(
      coverNames.map((name) => covers[name].cover)
    );
    expect(coverNames).toEqual(['magenta', 'coral', 'tangerine', 'amber', 'lime', 'mint', 'azure', 'violet']);
  });

  it('sizes the bars 22x6 / 14x6 and keeps the 3px radius', async () => {
    await wrap(<CoverStrip testID="md" />);
    expect(flat(screen.getByTestId('md-magenta'))).toMatchObject({ width: 22, height: 6, borderRadius: 3 });
    expect(flat(screen.getByTestId('md')).gap).toBe(6);

    await wrap(<CoverStrip size="sm" testID="sm" />);
    expect(flat(screen.getByTestId('sm-magenta'))).toMatchObject({ width: 14, height: 6, borderRadius: 3 });
    expect(flat(screen.getByTestId('sm')).gap).toBe(5);
  });

  it('is hidden from assistive tech — it is pure ornament', async () => {
    await wrap(<CoverStrip testID="a11y" />);
    expect(screen.getByTestId('a11y').props.accessibilityElementsHidden).toBe(true);
  });
});

describe('Wordmark', () => {
  const brand = translate('_meta.brand');

  it('sets the brand from i18n, uppercased through upper()', async () => {
    await wrap(<Wordmark />);
    expect(screen.getByText(upper(brand))).toBeTruthy();
  });

  it('uppercases with the locale, not textTransform', async () => {
    await setLocale('tr');
    await wrap(<Wordmark />);
    const mark = screen.getByText(upper(brand, 'tr'));
    // `upper` is the only case fold in the library; textTransform would use the
    // root locale and break the moment the brand stops being ASCII.
    expect(StyleSheet.flatten(mark.props.style).textTransform).toBeUndefined();
  });

  it('defaults to display-xl plain, and to display-md for the two blocks', async () => {
    await wrap(
      <>
        <Wordmark testID="plain" />
        <Wordmark treatment="inverse" testID="inverse" />
        <Wordmark treatment="lime" testID="lime" />
        <Wordmark size="sm" testID="sm" />
      </>
    );
    const sizeOf = (id: string) =>
      textStyle(screen.getByTestId(id).children[0] as { props: { style?: unknown } }).fontSize;
    expect(sizeOf('plain')).toBe(64);
    expect(sizeOf('inverse')).toBe(32);
    expect(sizeOf('lime')).toBe(32);
    expect(sizeOf('sm')).toBe(24);
  });

  it('gives the blocks their fixed grounds and leaves plain unboxed', async () => {
    await wrap(
      <>
        <Wordmark testID="plain" />
        <Wordmark treatment="inverse" testID="inverse" />
        <Wordmark treatment="lime" testID="lime" />
      </>
    );
    expect(flat(screen.getByTestId('plain')).backgroundColor).toBeUndefined();
    expect(flat(screen.getByTestId('inverse'))).toMatchObject({
      backgroundColor: '#171717',
      borderRadius: 8,
    });
    expect(flat(screen.getByTestId('lime')).backgroundColor).toBe(covers.lime.cover);
  });
});

describe('CoachMark', () => {
  const props = {
    title: 'Join an event to get started',
    body: 'Every event has a 6-character code and a QR at the door.',
    dismissLabel: 'Got it',
  };

  it('renders the bubble copy and dismisses by hand', async () => {
    const onDismiss = jest.fn();
    await wrap(<CoachMark {...props} onDismiss={onDismiss} testID="coach" />);
    expect(screen.getByText(props.title)).toBeTruthy();
    expect(screen.getByText(props.body)).toBeTruthy();
    await fireEvent.press(screen.getByText('Got it'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('offsets the tail, default 60', async () => {
    await wrap(<CoachMark {...props} onDismiss={() => {}} testID="a" />);
    const tailOf = (id: string) => {
      const root = screen.getByTestId(id) as unknown as { children: { props: { style?: unknown } }[] };
      return flat(root.children[root.children.length - 1]!);
    };
    expect(tailOf('a').marginLeft).toBe(60);

    await wrap(<CoachMark {...props} onDismiss={() => {}} tailOffset={120} testID="b" />);
    expect(tailOf('b').marginLeft).toBe(120);
    // the RN triangle: a 0x0 box whose top border is the only visible edge
    expect(tailOf('b')).toMatchObject({ width: 0, height: 0, borderTopColor: '#171717' });
  });
});

describe('Screen and BottomBar', () => {
  it('lays the body out as S.body: pad 4/16/130, gap 16', async () => {
    await wrap(
      <Screen testID="s">
        <></>
      </Screen>
    );
    const scroll = screen.getByTestId('s-scroll');
    // RCTScrollView -> the content container View -> our body
    const container = scroll.children[0] as { children: unknown[] };
    const body = container.children[0] as { props: { style?: unknown } };
    expect(flat(body)).toMatchObject({
      gap: 16,
      paddingTop: 4,
      paddingHorizontal: 16,
      paddingBottom: 130,
    });
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('renders a plain body with no scroller when `scroll` is false', async () => {
    await wrap(
      <Screen scroll={false} testID="plain">
        <></>
      </Screen>
    );
    expect(screen.queryByTestId('plain-scroll')).toBeNull();
  });

  it('floats the bar over the body with the real bottom inset, floored at 34', async () => {
    await wrap(<BottomBar testID="bar">{null}</BottomBar>);
    expect(flat(screen.getByTestId('bar'))).toMatchObject({
      position: 'absolute',
      bottom: 0,
      zIndex: 5,
      paddingTop: 20,
      paddingHorizontal: 16,
      paddingBottom: 34, // METRICS.insets.bottom
      gap: 8,
      flexDirection: 'column',
    });
  });

  it('`row` switches the thumb zone to a row', async () => {
    await wrap(
      <BottomBar row testID="row">
        {null}
      </BottomBar>
    );
    expect(flat(screen.getByTestId('row')).flexDirection).toBe('row');
  });

  it('paints the 20px fade as two strips above a solid bg block', async () => {
    await wrap(<BottomBar testID="fade">{null}</BottomBar>);
    const layers = (screen.getByTestId('fade').children as { props: { style?: unknown } }[]).map(flat);
    expect(layers[0]).toMatchObject({ top: 0, height: 10, opacity: 0.36, backgroundColor: colors.bg });
    expect(layers[1]).toMatchObject({ top: 10, height: 10, opacity: 0.72, backgroundColor: colors.bg });
    expect(layers[2]).toMatchObject({ top: 20, bottom: 0, backgroundColor: colors.bg });
  });
});
