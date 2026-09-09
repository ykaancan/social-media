import React, { useState } from 'react';
import { View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button } from '../core';
import { useTranslation } from '../../i18n';

/** Inline native pickers inside CreateSheet; Android picks date then time. */
export function EventDatePicker({ value, onChange, onClose }: {
  value: Date; onChange: (value: Date) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const [draft, setDraft] = useState(value);
  return <View>
    <DateTimePicker value={draft} mode={mode} display="spinner" onChange={(event, selected) => {
      if (event.type === 'dismissed') { onClose(); return; }
      if (selected) setDraft(selected);
    }} />
    <Button onPress={() => { if (mode === 'date') setMode('time'); else { onChange(draft); onClose(); } }}>
      {t(mode === 'date' ? 'common.next' : 'common.done')}
    </Button>
    <Button variant="ghost" onPress={onClose}>{t('common.cancel')}</Button>
  </View>;
}
