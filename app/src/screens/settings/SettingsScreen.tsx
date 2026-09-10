import React,{useCallback,useRef,useState} from 'react';
import { Linking, Share, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApi, type AccountSettings, type BlockedEntry, type SectionSummary } from '../../api';
import { BlockedRow, ChoiceRow, Back, Screen, Group, Row, Note, Empty, LoadState, ConfirmSheet, SectionSheet, useToast } from '../../components/patterns';
import { Button, Chip, Input, Switch, Text } from '../../components/core';
import { useLocale, useTranslation, setLocale, type Locale } from '../../i18n';
import { setPref, PREF_KEYS } from '../../prefs';
import { useSession } from '../../session';
import { useMessages } from '../../messages/MessagesProvider';
import { useThreads } from '../../threads/ThreadsProvider';
import { useTheme } from '../../theme';
import type { RootScreenProps } from '../../navigation/types';

export type SettingsPage='privacy'|'blocked'|'muted'|'notifications'|'language'|'section';
const titles:Record<SettingsPage,string>={privacy:'whoCanWrite',blocked:'blocked',muted:'mutedWords',notifications:'notifications',language:'language',section:'mySection'};
const policies=['anyone','named_only','nobody'] as const;
const policyKeys={anyone:'anyone',named_only:'namedOnly',nobody:'nobody'};

export function SettingsScreen({navigation,route}:RootScreenProps<'Settings'>){
  const page=route.params?.page,api=useApi(),session=useSession(),locale=useLocale(),{t}=useTranslation(),{colors}=useTheme(),toast=useToast();
  const {refresh:refreshInbox}=useMessages(),{refresh:refreshThreads}=useThreads();
  const [settings,setSettings]=useState<AccountSettings|null>(null),[blocked,setBlocked]=useState<BlockedEntry[]>([]),[sections,setSections]=useState<SectionSummary[]>([]);
  const [loadError,setLoadError]=useState(false),[error,setError]=useState(false),[busy,setBusy]=useState(false),[word,setWord]=useState('');
  const [sheet,setSheet]=useState<'logout'|'delete'|'deleteFinal'|'picker'|null>(null),[confirmWord,setConfirmWord]=useState(''),[section,setSection]=useState<SectionSummary|null>(null);
  const working=useRef(false),active=useRef(false),sequence=useRef(0);
  const load=useCallback(async()=>{const seq=++sequence.current;try{const [s,b,list]=await Promise.all([api.getSettings(),api.getBlocked(),api.listSections()]);if(active.current&&sequence.current===seq){setSettings(s);setBlocked(b);setSections(list);setLoadError(false);}}catch{if(active.current&&sequence.current===seq)setLoadError(true);}},[api]);
  useFocusEffect(useCallback(()=>{active.current=true;void load();return()=>{active.current=false;sequence.current++;};},[load]));
  const run=async(action:()=>Promise<unknown>)=>{if(working.current)return;working.current=true;sequence.current++;setBusy(true);setError(false);try{await action();}catch{setError(true);}finally{working.current=false;setBusy(false);}};
  const save=(input:Parameters<typeof api.updateSettings>[0])=>run(async()=>{setSettings(await api.updateSettings(input));toast.show(t('settingsFlow.saved'));});
  const open=(target:SettingsPage)=>navigation.push('Settings',{page:target});
  const title=t(page?'settings.'+titles[page]:'settings.title');
  const available=!settings?.sectionChangeAvailableAt||Date.now()>=Date.parse(settings.sectionChangeAvailableAt);
  const legal=(url:string|undefined)=>{if(url&&/^https:\/\//.test(url))void run(()=>Linking.openURL(url));};
  const privacyUrl=/^https:\/\//.test(process.env.EXPO_PUBLIC_PRIVACY_URL??'')?process.env.EXPO_PUBLIC_PRIVACY_URL:undefined,termsUrl=/^https:\/\//.test(process.env.EXPO_PUBLIC_TERMS_URL??'')?process.env.EXPO_PUBLIC_TERMS_URL:undefined;
  return <Screen testID="settings-screen" keyboard header={<Back title={title} onBack={()=>navigation.goBack()}/> }>
    {loadError&&<LoadState error onRetry={()=>{void load();}}/>}
    {error&&<Text accessibilityRole="alert" color={colors.danger}>{t('settingsFlow.error')}</Text>}
    {!settings&&!loadError&&<LoadState onRetry={()=>{void load();}}/>}
    {settings&&!page&&<>
      <Text variant="captionCaps">{t('settingsFlow.privacy')}</Text>
      <Group>
        <Row icon="MessageSquareLock" label={t('settings.whoCanWrite')} value={t('settings.'+policyKeys[settings.writingPolicy])} onPress={()=>open('privacy')}/>
        <Row icon="Ban" label={t('settings.blocked')} value={String(blocked.length)} onPress={()=>open('blocked')}/>
        <Row icon="VolumeX" label={t('settings.mutedWords')} value={String(settings.mutedWords.length)} onPress={()=>open('muted')}/>
      </Group>
      <Group><Row icon="Bell" label={t('settings.notifications')} value={`${Object.values(settings.notifications).filter(Boolean).length}/3`} onPress={()=>open('notifications')}/>
        <Row icon="Languages" label={t('settings.language')} value={t(locale==='tr'?'settingsFlow.turkish':'settingsFlow.english')} onPress={()=>open('language')}/></Group>
      <Text variant="captionCaps">{t('settingsFlow.account')}</Text>
      <Group><Row icon="UserPen" label={t('onboarding.editProfile')} onPress={()=>navigation.navigate('ProfileSetup',{edit:true})}/>
        <Row icon="MapPin" label={t('settings.mySection')} description={session.me?.section?.name} onPress={()=>open('section')}/>
        <Row icon="LogOut" label={t('onboarding.logOut')} onPress={()=>{setError(false);setSheet('logout');}}/>
        <Row icon="Trash2" danger label={t('settings.deleteAccount')} onPress={()=>{setError(false);setSheet('delete');}}/></Group>
      <Text variant="captionCaps">{t('settingsFlow.legal')}</Text>
      <Group><Row icon="Shield" label={t('settingsFlow.privacyPolicy')} description={t(privacyUrl?'settingsFlow.browser':'settingsFlow.legalPending')} external onPress={privacyUrl?()=>legal(privacyUrl):undefined}/>
        <Row icon="FileText" label={t('settingsFlow.terms')} description={t(termsUrl?'settingsFlow.browser':'settingsFlow.legalPending')} external onPress={termsUrl?()=>legal(termsUrl):undefined}/>
        <Row icon="FileText" label={t('settingsFlow.export')} onPress={busy?undefined:()=>{void run(async()=>{const data=await api.exportAccount();await Share.share({title:t('settingsFlow.export'),message:JSON.stringify(data,null,2)});});}}/></Group>
    </>}
    {settings&&page==='privacy'&&<><Group>{policies.map(policy=><ChoiceRow selected={settings.writingPolicy===policy} disabled={busy} key={policy} label={t('settings.'+policyKeys[policy])} description={t('settingsFlow.'+policy)} onPress={()=>{void save({writingPolicy:policy});}}/>)}</Group><Note>{t('settingsFlow.futureOnly')}</Note></>}
    {settings&&page==='blocked'&&<><Note>{t('settingsFlow.blockNote')}</Note>{!blocked.length?<Empty icon="Ban" text={t('settingsFlow.noBlocks')}/>:<Group>{blocked.map(entry=><BlockedRow key={entry.id} sender={entry.sender} busy={busy} onUnblock={()=>{void run(async()=>{await api.unblock(entry.id);setBlocked(await api.getBlocked());await Promise.all([refreshInbox(),refreshThreads()]);});}}/>)}</Group>}</>}
    {settings&&page==='muted'&&<><Note>{t('settingsFlow.mutedNote')}</Note><View style={{flexDirection:'row',alignItems:'center',gap:8}}><Input style={{flex:1}} label={t('settings.addWord')} value={word} onChange={setWord} maxLength={40} testID="muted-word"/><Button variant="secondary" disabled={busy||!word.trim()||settings.mutedWords.length>=100} onPress={()=>{void run(async()=>{setSettings(await api.updateSettings({mutedWords:[...settings.mutedWords,word.trim()]}));setWord('');});}}>{t('settingsFlow.add')}</Button></View>
      {!settings.mutedWords.length?<Empty icon="VolumeX" text={t('settingsFlow.noWords')}/>:<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{settings.mutedWords.map(value=><Chip key={value} tone="outline" icon="X" accessibilityLabel={t('settingsFlow.removeWord',{word:value})} onPress={busy?undefined:()=>{void save({mutedWords:settings.mutedWords.filter(w=>w!==value)});}}>{value}</Chip>)}</View>}</>}
    {settings&&page==='notifications'&&<><Group>{(['inbox','threads','boardMentions'] as const).map(key=><Switch key={key} label={t('settingsFlow.notifications.'+key)} description={t('settingsFlow.notifications.'+key+'Desc')} checked={settings.notifications[key]} onChange={busy?undefined:value=>{void save({notifications:{...settings.notifications,[key]:value}});}}/>)}</Group><Note>{t('settingsFlow.pushNote')}</Note></>}
    {settings&&page==='language'&&<><Group>{(['en','tr'] as Locale[]).map(value=><ChoiceRow selected={value===locale} disabled={busy} key={value} label={t(value==='en'?'settingsFlow.english':'settingsFlow.turkish')} onPress={()=>{void run(async()=>{await setPref(PREF_KEYS.locale,value);await setLocale(value);});}}/>)}</Group><Note>{t('settingsFlow.languageNote')}</Note></>}
    {settings&&page==='section'&&<><Note icon="Clock">{t('settingsFlow.sectionNote')}</Note><Group><Row label={session.me?.section?.name??''} description={session.me?.section?.country} onPress={()=>navigation.navigate('Section',{id:session.me!.section!.id})}/></Group>
      {available?<Button testID="change-section" disabled={busy} onPress={()=>setSheet('picker')}>{t('settingsFlow.changeSection')}</Button>:<Note>{t('settingsFlow.sectionWait',{date:new Date(settings.sectionChangeAvailableAt!).toLocaleDateString(locale)})}</Note>}
      {sheet==='picker'&&<SectionSheet value={session.me?.section?.id} sections={sections.map(s=>({...s,members:s.memberCount}))} onClose={()=>setSheet(null)} onPick={picked=>{setSheet(null);if(picked.id!==session.me?.section?.id)setSection(sections.find(s=>s.id===picked.id)!);}}/>}
      {section&&<ConfirmSheet title={t('settingsFlow.changeSection')} body={t('settingsFlow.sectionConfirm',{name:section.name,country:section.country})} action={t('common.save')} danger={false} busy={busy} error={error?t('settingsFlow.error'):undefined} onClose={()=>setSection(null)} onConfirm={()=>{void run(async()=>{await api.changeSection(section.id);await session.refreshMe();setSection(null);await load();toast.show(t('settingsFlow.saved'));});}}/>}
    </>}
    {sheet==='logout'&&<ConfirmSheet title={t('onboarding.logOut')} body={t('settingsFlow.logoutBody')} action={t('onboarding.logOut')} danger={false} busy={busy} onClose={()=>setSheet(null)} onConfirm={()=>{void run(()=>session.logout());}}/>}
    {sheet==='delete'&&<ConfirmSheet title={t('settings.deleteAccount')} body={t('settingsFlow.deleteBody')} action={t('common.next')} onClose={()=>setSheet(null)} onConfirm={()=>{setConfirmWord('');setSheet('deleteFinal');}}/>}
    {sheet==='deleteFinal'&&<ConfirmSheet title={t('settingsFlow.lastCheck')} body={t('settingsFlow.deleteType',{word:t('settingsFlow.deleteWord')})} action={t('settings.deleteAccount')} busy={busy} disabled={confirmWord.toLocaleUpperCase(locale)!==t('settingsFlow.deleteWord')} error={error?t('settingsFlow.error'):undefined} preview={<Input testID="delete-word" value={confirmWord} onChange={setConfirmWord} label={t('settingsFlow.deleteWord')}/>} onClose={()=>setSheet(null)} onConfirm={()=>{if(confirmWord.toLocaleUpperCase(locale)===t('settingsFlow.deleteWord'))void run(()=>session.deleteAccount());}}/>}
  </Screen>;
}
