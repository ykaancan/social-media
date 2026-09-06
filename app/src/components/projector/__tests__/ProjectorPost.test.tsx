import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { initI18n } from '../../../i18n';
import { covers, EventColorProvider, ThemeProvider, typography } from '../../../theme';
import { ProjectorPost } from '../ProjectorPost';

initI18n();

/** The projector scope is applied by the screen, never by the component. */
function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider scheme="projector">
      <EventColorProvider cover="lime">{node}</EventColorProvider>
    </ThemeProvider>
  );
}

const sixty = 'x'.repeat(60);

describe('ProjectorPost', () => {
  it('uses the bigger short face at exactly 60 characters', async () => {
    await wrap(<ProjectorPost text={sixty} />);
    expect(StyleSheet.flatten(screen.getByTestId('projector-post-body').props.style).fontSize).toBe(
      typography.projectorPostShort.fontSize
    );
  });

  it('drops to the long face at 61', async () => {
    await wrap(<ProjectorPost text={`${sixty}x`} />);
    expect(StyleSheet.flatten(screen.getByTestId('projector-post-body').props.style).fontSize).toBe(
      typography.projectorPost.fontSize
    );
  });

  it('shows the top three reactions, biggest first, and hides the zeroes', async () => {
    await wrap(
      <ProjectorPost
        text="Whoever brought the speaker to the bus: legend."
        sender={{ level: 'hint', hints: { section: 'ESN Ankara' } }}
        time="22:41"
        reactions={{ '😂': 8, '🔥': 31, '👀': 44, '😳': 2, '❤️': 0 }}
      />
    );
    const json = JSON.stringify(screen.toJSON());
    const at = (s: string) => json.indexOf(s);

    expect(screen.getByText('44')).toBeTruthy();
    expect(screen.getByText('31')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    // fourth by count, and the zero, are not shown
    expect(screen.queryByText('2')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();

    expect(at('44')).toBeLessThan(at('31'));
    expect(at('31')).toBeLessThan(at('"8"'));
  });

  it('paints the rail in the event cover colour and renders the sender badge', async () => {
    await wrap(
      <ProjectorPost
        testID="post"
        text="Kim o ceketli?"
        sender={{ level: 'named', name: 'Deniz Aksoy' }}
        time="22:39"
      />
    );
    expect(screen.getByText('Deniz Aksoy')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain(covers.lime.cover);
  });

  it('renders the time uppercased with tabular figures', async () => {
    await wrap(<ProjectorPost text="hey" time="22:41" />);
    const time = screen.getByText('22:41');
    expect(StyleSheet.flatten(time.props.style).fontVariant).toContain('tabular-nums');
  });
});
