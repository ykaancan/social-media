import { lower, normalizeForSearch, upper } from '../text';

describe('upper', () => {
  it('uppercases Turkish dotted i to U+0130', () => {
    expect(upper('izmir', 'tr')).toBe('İZMİR');
    expect(upper('İzmir', 'tr')).toBe('İZMİR');
  });

  it('uppercases Turkish dotless i to I', () => {
    expect(upper('ısı', 'tr')).toBe('ISI');
  });

  it('uses the generic mapping for English', () => {
    expect(upper('izmir', 'en')).toBe('IZMIR');
  });
});

describe('lower', () => {
  it('lowercases Turkish I to dotless i and U+0130 to i', () => {
    expect(lower('İZMİR', 'tr')).toBe('izmir');
    expect(lower('ISI', 'tr')).toBe('ısı');
  });

  it('never emits a combining dot above', () => {
    expect(lower('İ', 'tr')).toBe('i');
    expect(lower('İ', 'tr')).not.toContain('̇');
  });

  it('uses the generic mapping for English', () => {
    expect(lower('IZMIR', 'en')).toBe('izmir');
  });
});

describe('normalizeForSearch', () => {
  it('folds Turkish diacritics away', () => {
    expect(normalizeForSearch('Boğaziçi')).toBe('bogazici');
    expect(normalizeForSearch('BOĞAZİÇİ')).toBe('bogazici');
    expect(normalizeForSearch('bogazici')).toBe('bogazici');
  });

  it('folds dotless and dotted i together', () => {
    expect(normalizeForSearch('ısı')).toBe('isi');
    expect(normalizeForSearch('ISI')).toBe('isi');
    expect(normalizeForSearch('İzmir')).toBe('izmir');
    expect(normalizeForSearch('IZMIR')).toBe('izmir');
  });

  it('strips combining marks left by NFD', () => {
    expect(normalizeForSearch('Şeyma')).toBe('seyma');
    expect(normalizeForSearch('Gülşah Öztürk')).toBe('gulsah ozturk');
  });
});
