import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme';
import { Icon, Text } from '../core';

/** Settings prototype's radio row; reused by writing permissions and language. */
export function ChoiceRow({label,description,selected,disabled,onPress}:{label:string;description?:string;selected:boolean;disabled?:boolean;onPress:()=>void}){
  const {colors}=useTheme();
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:selected,disabled:!!disabled}} disabled={disabled} onPress={onPress} style={{padding:16,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:colors.surface}}>
    <View style={{flex:1,gap:4}}><Text>{label}</Text>{description&&<Text variant="bodySm" color={colors.text2}>{description}</Text>}</View>
    <View style={{width:24,height:24,borderRadius:12,borderWidth:1,borderColor:colors.borderStrong,alignItems:'center',justifyContent:'center'}}>{selected&&<Icon name="Check" size={16}/>}</View>
  </Pressable>;
}
