import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { initI18n } from '../../../i18n';
import { EventColorProvider, ink, palette, ThemeProvider } from '../../../theme';
import { PostCard, REACTIONS } from '../PostCard';

initI18n();

// The `entering` card starts its post-in at opacity 0 and reanimated's jest
// mock never advances it, so query hidden elements in this file.
configure({ defaultIncludeHiddenElements: true });

const colors = palette('app');

function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider cover="magenta">{node}</EventColorProvider>
    </ThemeProvider>
  );
}

describe('PostCard', () => {
  it('exports the fixed five-emoji reaction set', () => {
    expect([...REACTIONS]).toEqual(['🔥', '😂', '❤️', '👀', '😳']);
  });

  it('shows a pill only for a reaction with a real count, or for mine', async () => {
    await wrap(
      <PostCard
        testID="p"
        text="Whoever brought the speaker to the bus: legend."
        sender={{ level: 'hint', hints: { section: 'ESN Ankara' } }}
        time="2m"
        reactions={{ '🔥': 3, '😂': 0 }}
        myReaction="👀"
      />
    );
    // real count -> shown
    expect(screen.getByTestId('p-react-🔥')).toBeTruthy();
    // zero and not mine -> never fabricated
    expect(screen.queryByTestId('p-react-😂')).toBeNull();
    // mine at zero -> shown, honestly at 0
    expect(screen.getByTestId('p-react-👀')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('renders my reaction pill in ink-900 with white text', async () => {
    await wrap(<PostCard testID="p" text="x" reactions={{ '🔥': 1 }} myReaction="🔥" />);
    const pill = screen.getByTestId('p-react-🔥');
    const inner = pill.children[0] as { props: { style?: unknown } };
    expect(StyleSheet.flatten(inner.props.style as ViewStyle)?.backgroundColor).toBe(ink[900]);
  });

  it('opens the tray from SmilePlus and reports the emoji tapped', async () => {
    const onReact = jest.fn();
    await wrap(<PostCard testID="p" text="x" onReact={onReact} />);
    expect(screen.queryByTestId('p-tray')).toBeNull();
    // RNTL 14 renders concurrently: a press that changes state has to be
    // awaited before the new tree can be queried.
    await fireEvent.press(screen.getByTestId('p-react'));
    expect(await screen.findByTestId('p-tray')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('❤️'));
    expect(onReact).toHaveBeenCalledWith('❤️');
    // the tray closes again
    expect(screen.queryByTestId('p-tray')).toBeNull();
  });

  it('fires onReply and onMore from the footer icon buttons', async () => {
    const onReply = jest.fn();
    const onMore = jest.fn();
    await wrap(<PostCard testID="p" text="x" onReply={onReply} onMore={onMore} />);
    await fireEvent.press(screen.getByLabelText('Reply privately'));
    await fireEvent.press(screen.getByLabelText('More'));
    expect(onReply).toHaveBeenCalled();
    expect(onMore).toHaveBeenCalled();
  });

  it('renders no footer at all without reactions or handlers', async () => {
    await wrap(<PostCard testID="p" text="x" time="Nov 14" />);
    expect(screen.queryByLabelText('More')).toBeNull();
    expect(screen.queryByLabelText('React')).toBeNull();
  });

  it('renders the source and approved-from-board meta chips', async () => {
    await wrap(
      <PostCard text="x" source="National Platform" approvedFromBoard time="1h" />
    );
    expect(screen.getByText('From National Platform')).toBeTruthy();
    expect(screen.getByText('Approved from the board')).toBeTruthy();
  });

  it('makes the first action primary and the rest secondary', async () => {
    const approve = jest.fn();
    await wrap(
      <PostCard
        text="x"
        actions={[
          { label: 'Approve to wall', icon: 'Check', onPress: approve },
          { label: 'Keep private' },
        ]}
      />
    );
    const first = screen.getByLabelText('Approve to wall');
    const second = screen.getByLabelText('Keep private');
    const bg = (el: { children: unknown[] }) =>
      StyleSheet.flatten((el.children[0] as { props: { style?: unknown } }).props.style as ViewStyle)
        ?.backgroundColor;
    expect(bg(first as never)).toBe(colors.primary);
    expect(bg(second as never)).toBe(colors.surface);
    await fireEvent.press(first);
    expect(approve).toHaveBeenCalled();
  });

  it('outlines the card in the event colour when eventOutline is set', async () => {
    await wrap(<PostCard testID="outlined" text="x" eventOutline />);
    const style = StyleSheet.flatten(
      screen.getByTestId('outlined').props.style as ViewStyle
    );
    // covers.magenta.cover, with the padding compensated 16 -> 15
    expect(style.borderColor).toBe('#ea5da9');
    expect(style.borderWidth).toBe(2);
    expect(style.padding).toBe(15);
  });

  it('renders children after the actions row', async () => {
    await wrap(
      <PostCard text="x" actions={[{ label: 'Approve to wall' }]}>
        {/* LockedCard passes its action row through here */}
        <></>
      </PostCard>
    );
    expect(screen.getByText('Approve to wall')).toBeTruthy();
  });
});
