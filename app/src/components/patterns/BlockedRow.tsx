import React from 'react';
import { View } from 'react-native';
import type { MessageSender } from '../../api';
import { AnonymityBadge } from '../anonymity';
import { Button } from '../core';
import { useTranslation } from '../../i18n';

/** Shows only the identity allowed at the time of blocking, including anonymous blocks. */
export function BlockedRow({sender,busy,onUnblock}:{sender:MessageSender;busy?:boolean;onUnblock:()=>void}){
  const {t}=useTranslation();
  return <View style={{padding:14,gap:10,flexDirection:'row',alignItems:'center'}}>
    <View style={{flex:1,minWidth:0}}><AnonymityBadge {...sender}/></View>
    <Button variant="secondary" size="sm" disabled={busy} onPress={onUnblock}>{t('settingsFlow.unblock')}</Button>
  </View>;
}
