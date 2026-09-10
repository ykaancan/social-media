import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ThreadSummary } from '../../api';
import { useLocale, useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { threadMessageText } from '../../threads/presentation';
import { AnonymityBadge } from '../anonymity';
import { Text } from '../core';

export function ThreadRow({thread,onPress}:{thread:ThreadSummary;onPress:()=>void}) {
  const {t}=useTranslation(),locale=useLocale(),{colors}=useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={t('threadFlow.open')} onPress={onPress} testID={`thread-row-${thread.id}`}
    style={[styles.root,{borderBottomColor:colors.border}]}>
    <View style={styles.header}><AnonymityBadge {...thread.other}/><Text variant="caption" color={colors.text3}>{new Date(thread.updatedAt).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}</Text></View>
    <View style={styles.header}><Text variant={thread.unreadCount?'bodySmStrong':'bodySm'} numberOfLines={1} style={{flex:1}}>
      {thread.lastMessage.mine&&!thread.lastMessage.system?t('threadFlow.youPrefix'):''}{threadMessageText(thread.lastMessage)}
    </Text>{thread.unreadCount>0&&<View accessibilityLabel={t('threadFlow.unread',{n:thread.unreadCount})} style={[styles.dot,{backgroundColor:colors.text}]}/>}</View>
    {thread.other.level!=='named'&&<Text variant="caption" color={colors.text2}>{t('threadFlow.from',{event:thread.source})}</Text>}
  </Pressable>;
}
const styles=StyleSheet.create({root:{paddingVertical:12,paddingHorizontal:14,gap:6,minHeight:72,borderBottomWidth:1},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},dot:{width:8,height:8,borderRadius:4}});
