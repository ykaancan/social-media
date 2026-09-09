import React, { useState } from 'react';
import { Button, Input } from '../core';
import { useTranslation } from '../../i18n';

/** Web preview fallback. Native builds use the platform date/time controls. */
export function EventDatePicker({ value, onChange, onClose }: {
  value: Date; onChange: (value: Date) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const pad = (n: number) => String(n).padStart(2, '0');
  const [text, setText] = useState(`${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`);
  const date = new Date(text.replace(' ', 'T'));
  const valid = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text) && Number.isFinite(date.getTime());
  return <>
    <Input label={t('eventFlow.dateTime')} value={text} onChange={setText} />
    <Button disabled={!valid} onPress={() => { onChange(date); onClose(); }}>{t('common.done')}</Button>
    <Button variant="ghost" onPress={onClose}>{t('common.cancel')}</Button>
  </>;
}
