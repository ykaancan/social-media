import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { initI18n, setLocale } from '../../../i18n';
import { EventColorProvider, ThemeProvider } from '../../../theme';
import { Avatar, Button, Icon, Text } from '../index';

initI18n();

// RNTL 14's render is async.
function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider>{node}</EventColorProvider>
    </ThemeProvider>
  );
}

afterEach(async () => {
  await setLocale('en');
});

describe('core primitives render', () => {
  it('renders Text', async () => {
    await wrap(<Text variant="title">Wall</Text>);
    expect(screen.getByText('Wall')).toBeTruthy();
  });

  it('uppercases with the Turkish rules when the locale is tr', async () => {
    await setLocale('tr');
    await wrap(<Text upper>istanbul</Text>);
    expect(screen.getByText('İSTANBUL')).toBeTruthy();
  });

  it('uppercases with the generic rules in English', async () => {
    await wrap(<Text upper>istanbul</Text>);
    expect(screen.getByText('ISTANBUL')).toBeTruthy();
  });

  it('renders an Avatar initial', async () => {
    await wrap(<Avatar name="Şeyma Kaya" />);
    expect(screen.getByText('Ş')).toBeTruthy();
  });

  it('renders every Button variant', async () => {
    await wrap(
      <>
        <Button variant="primary">Send</Button>
        <Button variant="secondary">Keep private</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">Block</Button>
        <Button variant="event" icon="Radio">
          Join board
        </Button>
      </>
    );
    for (const label of ['Send', 'Keep private', 'Cancel', 'Block', 'Join board']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('marks a loading Button disabled and busy', async () => {
    await wrap(
      <Button loading testID="btn">
        Sending
      </Button>
    );
    expect(screen.getByTestId('btn').props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
  });

  it('renders an Icon', async () => {
    const tree = await wrap(<Icon name="VenetianMask" />);
    expect(tree.toJSON()).toBeTruthy();
  });
});
