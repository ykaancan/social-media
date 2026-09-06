import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { initI18n } from '../../../i18n';
import { EventColorProvider, palette, ThemeProvider } from '../../../theme';
import { Icon, IconButton, Input, Sheet, Switch, Tabs, Toast } from '../index';

initI18n();

// Toast and Sheet start their entrance animation at opacity 0, and reanimated's
// jest mock never advances it, so RNTL would treat their whole subtree as
// hidden. Query hidden elements in this file rather than assert on a frame the
// user never sees.
configure({ defaultIncludeHiddenElements: true });

const colors = palette('app');

function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider>{node}</EventColorProvider>
    </ThemeProvider>
  );
}

/** The backgroundColor a rendered element resolves to. */
function bg(el: { props: { style?: unknown } }): string | undefined {
  return StyleSheet.flatten(el.props.style as ViewStyle)?.backgroundColor as string | undefined;
}

/** The text colour a rendered element resolves to. */
function fg(el: { props: { style?: unknown } }): string | undefined {
  return StyleSheet.flatten(el.props.style as TextStyle)?.color as string | undefined;
}

describe('IconButton', () => {
  it('uses `label` as the accessibility label', async () => {
    await wrap(<IconButton icon="ArrowLeft" label="Back" testID="back" />);
    expect(screen.getByTestId('back').props.accessibilityLabel).toBe('Back');
  });

  it('renders the badge and caps it at 99+', async () => {
    await wrap(
      <>
        <IconButton icon="ListChecks" label="Queue" variant="outline" badge={7} />
        <IconButton icon="Inbox" label="Inbox" badge={1204} />
      </>
    );
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('renders no badge for 0 or undefined, like the web', async () => {
    await wrap(<IconButton icon="Inbox" label="Inbox" badge={0} />);
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('Input', () => {
  it('shows the {len}/{max} counter and passes maxLength through', async () => {
    await wrap(<Input label="One-line bio" value="Erasmus in Ankara" maxLength={80} testID="bio" />);
    expect(screen.getByText('17/80')).toBeTruthy();
    expect(screen.getByTestId('bio').props.maxLength).toBe(80);
  });

  it('prefers the error over the hint and paints the footer danger', async () => {
    await wrap(<Input label="Email" hint="We never show it" error="That does not look like an email" />);
    expect(screen.queryByText('We never show it')).toBeNull();
    expect(fg(screen.getByText('That does not look like an email'))).toBe(colors.danger);
  });

  it('reports changes through onChange', async () => {
    const onChange = jest.fn();
    await wrap(<Input value="" onChange={onChange} testID="code" />);
    await fireEvent.changeText(screen.getByTestId('code'), 'AB12');
    expect(onChange).toHaveBeenCalledWith('AB12');
  });

  it('maps `type` onto the keyboard', async () => {
    await wrap(<Input type="email" value="" testID="mail" />);
    const input = screen.getByTestId('mail');
    expect(input.props.keyboardType).toBe('email-address');
    expect(input.props.autoCapitalize).toBe('none');
  });
});

describe('Switch', () => {
  it('exposes the checked state', async () => {
    await wrap(<Switch checked label="Inbox" testID="sw" />);
    expect(screen.getByTestId('sw').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('toggles from a press on the row', async () => {
    const onChange = jest.fn();
    await wrap(<Switch checked={false} onChange={onChange} label="Inbox" description="Someone writes to you" testID="sw" />);
    await fireEvent.press(screen.getByTestId('sw'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles from a press on the track', async () => {
    const onChange = jest.fn();
    await wrap(<Switch checked onChange={onChange} label="Inbox" testID="sw" />);
    await fireEvent.press(screen.getByTestId('sw-track'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('renders the bare track without a label', async () => {
    await wrap(<Switch checked={false} label={undefined} testID="sw" />);
    expect(screen.queryByText('Inbox')).toBeNull();
    expect(screen.getByTestId('sw-track')).toBeTruthy();
  });
});

const TAB_ITEMS = [
  { id: 'board', label: 'Board' },
  { id: 'queue', label: 'Queue', count: 7, hot: true },
  { id: 'people', label: 'People', count: 212 },
  { id: 'room', label: 'Room', disabled: true },
];

describe('Tabs', () => {
  it('calls onChange with the item id', async () => {
    const onChange = jest.fn();
    await wrap(<Tabs items={TAB_ITEMS} value="board" onChange={onChange} testID="tabs" />);
    await fireEvent.press(screen.getByTestId('tabs-people'));
    expect(onChange).toHaveBeenCalledWith('people');
  });

  it('does not fire for a disabled item', async () => {
    const onChange = jest.fn();
    await wrap(<Tabs items={TAB_ITEMS} value="board" onChange={onChange} testID="tabs" />);
    await fireEvent.press(screen.getByTestId('tabs-room'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the selected tab', async () => {
    await wrap(<Tabs items={TAB_ITEMS} value="queue" onChange={jest.fn()} testID="tabs" />);
    expect(screen.getByTestId('tabs-queue').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('tabs-board').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('renders counts, and a hot count stays danger while unselected', async () => {
    await wrap(<Tabs items={TAB_ITEMS} value="board" onChange={jest.fn()} testID="tabs" />);
    expect(screen.getByText('212')).toBeTruthy();
    // the count text sits inside the badge View
    expect(bg(screen.getByText('7').parent!)).toBe(colors.danger);
    expect(bg(screen.getByText('212').parent!)).toBe(colors.surfaceMuted);
  });

  it('renders the segmented variant', async () => {
    await wrap(
      <Tabs
        variant="segmented"
        value="approve_first"
        items={[
          { id: 'approve_first', label: 'Approve first' },
          { id: 'post_immediately', label: 'Post immediately' },
        ]}
        testID="mode"
      />
    );
    expect(bg(screen.getByTestId('mode-approve_first'))).toBe(colors.surface);
  });
});

/**
 * RNTL 14 dropped the UNSAFE_*ByType queries, and Icon takes no testID, so a
 * glyph is identified by the SVG path data it renders.
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

async function glyphPaths(name: React.ComponentProps<typeof Icon>['name']): Promise<string[]> {
  // Never unmount() here: a second render in the same test comes back empty
  // once an earlier one has been unmounted.
  const view = await wrap(<Icon name={name} size={18} strokeWidth={2.25} />);
  return paths(view.toJSON());
}

describe('Toast', () => {
  it('picks the default icon for each tone', async () => {
    for (const [tone, name] of [
      ['neutral', 'Check'],
      ['warn', 'TriangleAlert'],
      ['danger', 'CircleX'],
      ['live', 'Radio'],
    ] as const) {
      const expected = await glyphPaths(name);
      expect(expected.length).toBeGreaterThan(0);

      const view = await wrap(<Toast tone={tone} message="On your wall" />);
      expect(paths(view.toJSON())).toEqual(expect.arrayContaining(expected));
    }
  });

  it('honours an explicit icon and hides it for icon={null}', async () => {
    const arrowUp = await glyphPaths('ArrowUp');
    const view = await wrap(<Toast tone="live" icon="ArrowUp" message="3 new posts" action="Show" />);
    expect(paths(view.toJSON())).toEqual(expect.arrayContaining(arrowUp));

    const bare = await wrap(<Toast message="On your wall" icon={null} />);
    expect(paths(bare.toJSON())).toHaveLength(0);
  });

  it('fires onAction from the action pill', async () => {
    const onAction = jest.fn();
    await wrap(<Toast message="On your wall" action="View" onAction={onAction} />);
    await fireEvent.press(screen.getByText('View'));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('Sheet', () => {
  it('renders the uppercased title and its children when open', async () => {
    await wrap(
      <Sheet open title="Who can write to me" onClose={jest.fn()} testID="sheet">
        <Input label="Anyone" value="" />
      </Sheet>
    );
    expect(screen.getByText('WHO CAN WRITE TO ME')).toBeTruthy();
    expect(screen.getByText('Anyone')).toBeTruthy();
  });

  it('renders nothing when closed', async () => {
    await wrap(
      <Sheet open={false} title="Who can write to me" onClose={jest.fn()} testID="sheet">
        <Input label="Anyone" value="" />
      </Sheet>
    );
    expect(screen.queryByText('WHO CAN WRITE TO ME')).toBeNull();
    expect(screen.queryByText('Anyone')).toBeNull();
  });

  it('closes from the scrim and from the header button', async () => {
    const onClose = jest.fn();
    await wrap(
      <Sheet open title="Anonymity" onClose={onClose} testID="sheet">
        <Input label="Anyone" value="" />
      </Sheet>
    );
    await fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
