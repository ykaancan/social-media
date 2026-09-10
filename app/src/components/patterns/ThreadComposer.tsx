import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { BottomBar } from './BottomBar';
import { Note } from './Note';
import { IconButton, Input, Text } from '../core';

export function ThreadComposer({onScreen,onSend}:{onScreen:(text:string)=>Promise<{warning:boolean}>;onSend:(text:string,ack:boolean)=>Promise<void>}) {
  const {t}=useTranslation(),{colors}=useTheme();
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(false),[warned,setWarned]=useState<string>();
  const running=useRef(false),body=text.trim(),warning=warned===body;
  const submit=async()=>{if(running.current||!body||body.length>500)return;running.current=true;setBusy(true);setError(false);
    try{if(!warning&&(await onScreen(body)).warning){setWarned(body);return;}await onSend(body,warning);setText('');setWarned(undefined);}
    catch{setError(true);}finally{running.current=false;setBusy(false);}
  };
  return <BottomBar>
    {warning&&<Note icon="TriangleAlert"><Text variant="bodySm">{t('composer.screeningWarning')} {t('composer.screeningDetail')}</Text></Note>}
    {error&&<Text accessibilityRole="alert" color={colors.danger}>{t('messageFlow.sendError')}</Text>}
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
      <Input style={{flex:1}} value={text} onChange={value=>{if(!running.current)setText(value);}} multiline rows={2} maxLength={500} placeholder={t('thread.placeholder')} testID="thread-text"/>
      <IconButton icon="ArrowUp" variant="filled" label={t(warning?'messageFlow.sendAnyway':'composer.send')} disabled={busy||!body||body.length>500} testID="thread-send" onPress={()=>{void submit();}}/>
    </View>
  </BottomBar>;
}
