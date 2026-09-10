import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BoardPost } from '../../api/board';
import { ink, useEventColor, ThemeProvider, useMotion } from '../../theme';
import { useTranslation } from '../../i18n';
import { Text, Button, StatusPill } from '../core';
import { ProjectorPost } from './ProjectorPost';

/** A 1920×1080 read-only canvas, fitted to the actual display. */
export function ProjectorStage({ name, posts, status, onExit }: {name:string; posts:BoardPost[]; status:'live'|'upcoming'|'archived'; onExit:()=>void}) {
  const {t}=useTranslation(), event=useEventColor(), {reduced}=useMotion();
  const [size,setSize]=useState({width:1920,height:1080}), [index,setIndex]=useState(0), [paused,setPaused]=useState(false);
  useEffect(()=>{if(paused||reduced||posts.length<2)return;
    const timer=setInterval(()=>setIndex(i=>(i+1)%posts.length),8000);return()=>clearInterval(timer);
  },[paused,reduced,posts.length]);
  const post=posts[index%Math.max(1,posts.length)];
  const scale=Math.min(size.width/1920,size.height/1080);
  return <ThemeProvider scheme="projector"><View testID="projector-stage" style={styles.root} onLayout={e=>setSize(e.nativeEvent.layout)}>
    <View style={[styles.stage,{left:(size.width-1920)/2,top:(size.height-1080)/2,transform:[{scale}]}]}>
      <View style={[styles.line,{backgroundColor:event.cover}]}/>
      <View style={styles.header}><Text variant="projectorTitle" upper numberOfLines={2} style={{flex:1}}>{name}</Text><StatusPill status={status}/></View>
      {post?<ProjectorPost key={post.id} text={post.text} sender={post.sender} reactions={post.reactions}/>:<Text variant="projectorPost">{t('boardFlow.projectorEmpty')}</Text>}
    </View>
    <View style={styles.controls}>
      {posts.length>1&&<>{!reduced&&<Button size="sm" variant="secondary" onPress={()=>setPaused(value=>!value)}>{t(paused?'boardFlow.play':'boardFlow.pause')}</Button>}<Button size="sm" variant="secondary" onPress={()=>setIndex(i=>(i+1)%posts.length)}>{t('common.next')}</Button></>}
      <Button size="sm" variant="secondary" onPress={onExit}>{t('boardFlow.exitProjector')}</Button>
    </View>
  </View></ThemeProvider>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:ink[950],overflow:'hidden'},stage:{position:'absolute',width:1920,height:1080,padding:80,gap:48},
  line:{position:'absolute',left:0,right:0,top:0,height:8},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:32},
  controls:{position:'absolute',right:16,bottom:24,flexDirection:'row',gap:8}});
