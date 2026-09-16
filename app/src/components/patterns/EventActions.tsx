import React from 'react';
import { View } from 'react-native';
import { Button, IconButton } from '../core';
import { useTranslation } from '../../i18n';

export function EventActions({ onProjector, onControls, onMods, disabled }: {
  onProjector: () => void; onControls?: () => void; onMods?: () => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
    <View style={{ flex: 1 }}><Button size="sm" variant="ghost" icon="Projector" testID="board-projector" onPress={onProjector}>{t('events.projector')}</Button></View>
    {onControls && <IconButton icon="Settings" testID="board-controls" label={t('events.boardControls')} disabled={disabled} onPress={onControls}/>}
    {onMods && <IconButton icon="Users" label={t('events.coModerators')} disabled={disabled} onPress={onMods}/>}
  </View>;
}
