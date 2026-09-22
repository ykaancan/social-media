import React from 'react';
import { Button, Text } from '../core';
import { Note } from './Note';
import { useTranslation } from '../../i18n';

export function RefreshNotice({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return <Note><Text accessibilityRole="alert">{t('common.refreshError')}</Text>
    <Button variant="ghost" onPress={onRetry}>{t('common.retry')}</Button>
  </Note>;
}
