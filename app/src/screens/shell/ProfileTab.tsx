import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text, IconButton } from '../../components/core';
import { Empty, Screen, WallHeader, LoadState, MessageCard } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import type { TabScreenProps } from '../../navigation/types';
import { useSession } from '../../session';
import { useTheme } from '../../theme';
import { useMessages } from '../../messages/MessagesProvider';
import { MessageActions } from '../../messages/MessageActions';

/** Profile is the owner's wall; exactly approved, visible inbox messages. */
export function ProfileTab({ navigation }: TabScreenProps<'Profile'>) {
  const { t } = useTranslation(), { colors } = useTheme(), { me } = useSession();
  const { inbox, error, refresh } = useMessages();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = inbox?.messages.find(message => message.id === selectedId);
  const section = me?.section;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return <Screen testID="profile-screen" bottom={selected && <MessageActions key={selected.id} message={selected} onClose={() => setSelectedId(null)} />}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text variant="captionCaps" color={colors.text2} upper>{t('wall.myWall')}</Text><IconButton icon="Settings" label={t('settings.title')} testID="profile-settings" onPress={()=>navigation.navigate('Settings')}/></View>
    <WallHeader testID="profile-wall-header" user={{ name: me?.name ?? '', section: section?.name, country: section?.country, bio: me?.bio, avatar: me?.avatarUrl }}
      count={inbox?.counts.approved} onSection={section ? () => navigation.navigate('Section', { id: section.id }) : undefined} style={styles.header} />
    {error || !inbox ? <LoadState error={error} onRetry={() => { void refresh(); }} /> : <>
      {inbox.messages.filter(message => message.state === 'approved').map(message => <MessageCard key={message.id} message={message} wall onMore={() => setSelectedId(message.id)} />)}
      {!inbox.counts.approved && <Empty testID="profile-empty" icon="StickyNote" text={t('wall.emptyOwner')} />}
    </>}
  </Screen>;
}
const styles = StyleSheet.create({ header: { paddingTop: 0 } });
