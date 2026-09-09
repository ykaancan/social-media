import React from 'react';
import { Button, Text } from '../core';
import { useTranslation } from '../../i18n';

export function LoadState({ error, onRetry }: { error?: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return <>
    <Text accessibilityRole={error ? 'alert' : undefined}>{t(error ? 'eventFlow.requestError' : 'common.loading')}</Text>
    {error && <Button variant="secondary" onPress={onRetry}>{t('common.retry')}</Button>}
  </>;
}
