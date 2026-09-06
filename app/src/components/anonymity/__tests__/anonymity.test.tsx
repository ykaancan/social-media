import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { initI18n, setLocale } from '../../../i18n';
import { EventColorProvider, ThemeProvider } from '../../../theme';
import { AnonymityBadge } from '../AnonymityBadge';
import { AnonymitySelector } from '../AnonymitySelector';
import { HintChip } from '../HintChip';

initI18n();

function wrap(node: React.ReactNode) {
  return render(
    <ThemeProvider>
      <EventColorProvider>{node}</EventColorProvider>
    </ThemeProvider>
  );
}

/** Rendered order of a few strings, for "these chips come in this order" checks. */
function order(...needles: string[]): number[] {
  const json = JSON.stringify(screen.toJSON());
  return needles.map((n) => json.indexOf(n));
}

afterEach(async () => {
  await setLocale('en');
});

describe('HintChip', () => {
  it('renders a section clue', async () => {
    await wrap(<HintChip kind="section" value="ESN İzmir" />);
    expect(screen.getByText('ESN İzmir')).toBeTruthy();
  });

  it('uppercases the first letter with the Turkish rules and trails an ellipsis', async () => {
    await wrap(<HintChip kind="letter" value="irem" />);
    expect(screen.getByTestId('hint-chip-letter').props.children).toBe('İ');
    expect(JSON.stringify(screen.toJSON())).toContain('···');
  });

  it('falls back to "?" with no value', async () => {
    await wrap(<HintChip kind="letter" />);
    expect(screen.getByTestId('hint-chip-letter').props.children).toBe('?');
  });
});

describe('AnonymityBadge', () => {
  it('orders the clues section, country, letter', async () => {
    await wrap(
      <AnonymityBadge
        level="hint"
        hints={{ letter: 'Şeyma', country: 'Türkiye', section: 'ESN İzmir' }}
      />
    );
    const [section, country, letter] = order('ESN İzmir', 'Türkiye', 'Ş');
    expect(section).toBeGreaterThan(-1);
    expect(section).toBeLessThan(country);
    expect(country).toBeLessThan(letter);
  });

  it('falls back to the word "Hint" when the sender allowed no clue', async () => {
    await wrap(<AnonymityBadge level="hint" />);
    expect(screen.getByText('HINT')).toBeTruthy();
  });

  it('shows an avatar and the name when the level is named', async () => {
    await wrap(<AnonymityBadge level="named" name="Şeyma Kaya" />);
    expect(screen.getByText('Şeyma Kaya')).toBeTruthy();
    // the Avatar's tinted initial
    expect(screen.getByText('Ş')).toBeTruthy();
  });

  it('labels the anonymous level from the string table', async () => {
    await wrap(<AnonymityBadge level="anonymous" />);
    expect(screen.getByText('ANONYMOUS')).toBeTruthy();
  });

  it('hides the level word when showLevel is false', async () => {
    await wrap(<AnonymityBadge level="anonymous" showLevel={false} />);
    expect(screen.queryByText('ANONYMOUS')).toBeNull();
  });
});

describe('AnonymitySelector', () => {
  it('reports the level the sender picked', async () => {
    const onChange = jest.fn();
    await wrap(<AnonymitySelector value="anonymous" onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('anonymity-option-hint'));
    expect(onChange).toHaveBeenCalledWith('hint');
  });

  it('marks the chosen option checked', async () => {
    await wrap(<AnonymitySelector value="named" />);
    expect(screen.getByTestId('anonymity-option-named').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByTestId('anonymity-option-hint').props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  it('toggles a single hint field without touching the others', async () => {
    const onHintFieldsChange = jest.fn();
    await wrap(
      <AnonymitySelector
        value="hint"
        hintFields={{ section: true }}
        onHintFieldsChange={onHintFieldsChange}
        me={{ name: 'Şeyma', section: 'ESN İzmir', country: 'Türkiye' }}
      />
    );
    await fireEvent.press(screen.getByText('Country'));
    expect(onHintFieldsChange).toHaveBeenCalledWith({ section: true, country: true });
  });

  it('previews exactly the clues that are switched on', async () => {
    await wrap(
      <AnonymitySelector
        value="hint"
        hintFields={{ section: true, letter: true }}
        me={{ name: 'Şeyma', section: 'ESN İzmir', country: 'Türkiye' }}
      />
    );
    expect(screen.getByText("They'll see")).toBeTruthy();
    expect(screen.getByText('ESN İzmir')).toBeTruthy();
    expect(screen.getByTestId('hint-chip-letter').props.children).toBe('Ş');
    // country is off, so it must not appear anywhere in the preview
    expect(screen.queryByText('Türkiye')).toBeNull();
  });

  it('previews the name only at the named level', async () => {
    await wrap(<AnonymitySelector value="named" me={{ name: 'Deniz Aksoy' }} />);
    expect(screen.getByText('Deniz Aksoy')).toBeTruthy();
  });
});
