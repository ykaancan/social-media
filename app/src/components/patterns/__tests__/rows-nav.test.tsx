import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text as RNText, type ViewStyle } from 'react-native';
import { DEFAULT_LOCALE, initI18n, setLocale } from '../../../i18n';
import { covers, EventColorProvider, palette, ThemeProvider } from '../../../theme';
import { Back, Empty, Group, Note, PersonRow, Row, TabBar, WallHeader } from '../index';

initI18n();

const colors = palette('app');

function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider>{node}</EventColorProvider>
    </ThemeProvider>
  );
}

/**
 * Same trick as core/__tests__/controls.test.tsx: RNTL 14 has no query-by-type
 * and Icon takes no testID, so a glyph is identified by the SVG path data it
 * renders. Never call unmount() in this file — once one render is unmounted the
 * next one in the same file comes back empty.
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

/** lucide path data, read off the installed package (see Icon.test.ts). */
const CHEVRON = 'm9 18 6-6-6-6';
const EXTERNAL = 'M15 3h6v6';
const INFO = 'M12 16v-4';
const LOCK = 'M7 11V7a5 5 0 0 1 10 0v4';

function bgOf(el: { props: { style?: unknown } }): string | undefined {
  return StyleSheet.flatten(el.props.style as ViewStyle)?.backgroundColor as string | undefined;
}

afterEach(async () => {
  await setLocale(DEFAULT_LOCALE);
});

describe('Row', () => {
  it('renders label, value and the description line', async () => {
    await wrap(<Row icon="Bell" label="Inbox" value="On" description="Someone writes to you" />);
    expect(screen.getByText('Inbox')).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
    expect(screen.getByText('Someone writes to you')).toBeTruthy();
  });

  it('draws no chevron on a row that does nothing', async () => {
    const view = await wrap(<Row label="Language" value="English" />);
    expect(paths(view.toJSON())).not.toContain(CHEVRON);
  });

  it('draws the chevron on a pressable row', async () => {
    const view = await wrap(<Row label="Blocked" onPress={() => {}} />);
    expect(paths(view.toJSON())).toContain(CHEVRON);
  });

  it('draws the chevron when asked for explicitly', async () => {
    const view = await wrap(<Row label="Blocked" chevron />);
    expect(paths(view.toJSON())).toContain(CHEVRON);
  });

  it('swaps in ExternalLink when `external`', async () => {
    const view = await wrap(<Row label="Privacy policy" external onPress={() => {}} />);
    const drawn = paths(view.toJSON());
    expect(drawn).toContain(EXTERNAL);
    expect(drawn).not.toContain(CHEVRON);
  });

  it('fires onPress and exposes a button role', async () => {
    const onPress = jest.fn();
    await wrap(<Row label="Delete account" danger onPress={onPress} testID="row" />);
    expect(screen.getByTestId('row').props.accessibilityRole).toBe('button');
    await fireEvent.press(screen.getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Group', () => {
  it('draws n-1 hairlines between its children and shows the label', async () => {
    await wrap(
      <Group label="Safety" testID="group">
        <Row label="Blocked" />
        <Row label="Muted words" />
        <Row label="Who can write to me" />
      </Group>
    );
    expect(screen.getByText('SAFETY')).toBeTruthy();
    const root = screen.getByTestId('group');
    const card = root.children[root.children.length - 1] as { children: unknown[] };
    // 3 rows + 2 separators
    expect(card.children).toHaveLength(5);
  });

  it('renders no separator for a single child, and no label row', async () => {
    await wrap(
      <Group testID="one">
        <Row label="Only" />
      </Group>
    );
    const root = screen.getByTestId('one');
    expect(root.children).toHaveLength(1);
    const card = root.children[0] as { children: unknown[] };
    expect(card.children).toHaveLength(1);
  });

  it('defaults to --r-card and drops to --r-md for the sheet lists', async () => {
    await wrap(
      <>
        <Group testID="default">
          <Row label="Only" />
        </Group>
        <Group radius="md" testID="md">
          <Row label="Only" />
        </Group>
      </>
    );
    const cardOf = (id: string) =>
      StyleSheet.flatten(
        (screen.getByTestId(id).children[0] as { props: { style?: unknown } }).props.style as ViewStyle
      );
    expect(cardOf('default').borderRadius).toBe(14);
    expect(cardOf('md').borderRadius).toBe(10);
  });
});

describe('PersonRow', () => {
  it('marks me with the "you" suffix and defaults the sub line to the section', async () => {
    await wrap(<PersonRow person={{ id: 'm1', name: 'Deniz Aksoy', section: 'ESN Ankara' }} me />);
    expect(screen.getByText(/· you/)).toBeTruthy();
    expect(screen.getByText('ESN Ankara')).toBeTruthy();
  });

  it('takes an explicit sub line (the People tab passes section + country)', async () => {
    await wrap(<PersonRow person={{ name: 'Mira', section: 'ESN Köln' }} sub="ESN Köln · Germany" />);
    expect(screen.getByText('ESN Köln · Germany')).toBeTruthy();
    expect(screen.queryByText('ESN Köln')).toBeNull();
  });

  it('draws a chevron when it is pressable', async () => {
    const view = await wrap(<PersonRow person={{ name: 'Mira' }} onPress={() => {}} />);
    expect(paths(view.toJSON())).toContain(CHEVRON);
  });

  it('lets `right` replace the chevron', async () => {
    const view = await wrap(
      <PersonRow person={{ name: 'Mira' }} onPress={() => {}} right={<RNText>Remove</RNText>} />
    );
    expect(paths(view.toJSON())).not.toContain(CHEVRON);
    expect(screen.getByText('Remove')).toBeTruthy();
  });
});

describe('WallHeader', () => {
  const user = { name: 'Deniz Aksoy', section: 'ESN Ankara', country: 'Türkiye', bio: 'Here for the quiz' };

  it('[D11] shows one section-and-country chip and the real count', async () => {
    await wrap(<WallHeader user={user} count={3} />);
    expect(screen.getByText('ESN Ankara · Türkiye')).toBeTruthy();
    expect(screen.getByText('3 on the wall')).toBeTruthy();
    expect(screen.getByText('Here for the quiz')).toBeTruthy();
  });

  it('translates the count line', async () => {
    await setLocale('tr');
    await wrap(<WallHeader user={user} count={3} />);
    expect(screen.getByText('Duvarda 3')).toBeTruthy();
  });

  it('renders no count line when the count is unknown', async () => {
    await wrap(<WallHeader user={user} />);
    expect(screen.queryByText('0 on the wall')).toBeNull();
  });

  it('preview shows the placeholders and no count', async () => {
    await wrap(<WallHeader user={{ name: '' }} preview count={9} />);
    expect(screen.getByText('YOUR NAME')).toBeTruthy();
    expect(screen.getByText('Section · Country')).toBeTruthy();
    expect(screen.getByText('One line about you')).toBeTruthy();
    expect(screen.queryByText('9 on the wall')).toBeNull();
  });
});

describe('TabBar', () => {
  it('[D2] renders exactly the four tabs, in order', async () => {
    await wrap(<TabBar value="events" onChange={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.props.testID)).toEqual([
      'tab-events',
      'tab-inbox',
      'tab-threads',
      'tab-profile',
    ]);
    expect(tabs[0].props.accessibilityState.selected).toBe(true);
    expect(tabs[1].props.accessibilityState.selected).toBe(false);
  });

  it('shows a badge only for a count above zero', async () => {
    await wrap(<TabBar value="events" onChange={() => {}} badges={{ inbox: 4, threads: 0 }} />);
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('reports the tapped tab id', async () => {
    const onChange = jest.fn();
    await wrap(<TabBar value="events" onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('tab-threads'));
    expect(onChange).toHaveBeenCalledWith('threads');
  });

  it('labels come from i18n', async () => {
    await setLocale('tr');
    await wrap(<TabBar value="profile" onChange={() => {}} />);
    for (const label of ['Etkinlikler', 'Gelen kutusu', 'Sohbetler', 'Profil']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe('Empty', () => {
  it('uses the muted circle by default', async () => {
    await wrap(<Empty icon="Radio" text="Quiet in here." testID="e" />);
    expect(bgOf(screen.getByTestId('e').children[0] as never)).toBe(colors.surfaceMuted);
    expect(screen.getByText('Quiet in here.')).toBeTruthy();
  });

  it('tints the circle with the event colour when asked', async () => {
    await wrap(<Empty icon="Radio" text="The board opens later." tint testID="t" />);
    expect(bgOf(screen.getByTestId('t').children[0] as never)).toBe(covers.magenta.soft);
  });

  it('takes an explicit tint colour', async () => {
    await wrap(<Empty icon="Radio" text="Nothing rejected." tint="#abcdef" testID="c" />);
    expect(bgOf(screen.getByTestId('c').children[0] as never)).toBe('#abcdef');
  });
});

describe('Note', () => {
  it('defaults to the Info glyph and wraps a string child', async () => {
    const view = await wrap(<Note>Nothing to do until then.</Note>);
    expect(screen.getByText('Nothing to do until then.')).toBeTruthy();
    expect(paths(view.toJSON())).toContain(INFO);
  });

  it('takes another icon and lets nodes through untouched', async () => {
    const view = await wrap(
      <Note icon="Lock">
        <RNText>Only the two of you see it.</RNText>
      </Note>
    );
    const drawn = paths(view.toJSON());
    expect(drawn).toContain(LOCK);
    expect(drawn).not.toContain(INFO);
    expect(screen.getByText('Only the two of you see it.')).toBeTruthy();
  });
});

describe('Back', () => {
  it('fires onBack and uppercases the title', async () => {
    const onBack = jest.fn();
    await wrap(<Back onBack={onBack} title="Settings" />);
    expect(screen.getByText('SETTINGS')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders no title row when there is no title', async () => {
    await wrap(<Back onBack={() => {}} testID="back" />);
    expect(screen.getByTestId('back').children).toHaveLength(1);
  });
});
