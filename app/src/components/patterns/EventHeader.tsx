import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, StatusPill, Text } from '../core';
import type { EventStatus } from '../cards';
import { useTheme } from '../../theme';

/** Event detail title and metadata from events-app.jsx. Controls use Back above it. */
export function EventHeader({ name, status, date, scope, statusLabel }: {
  name: string; status: EventStatus; date: string; scope: string; statusLabel?: string;
}) {
  const { colors } = useTheme();
  return <View style={styles.root}>
    <View style={styles.titleRow}><Text variant="displayLg" upper style={styles.title}>{name}</Text><StatusPill status={status} label={statusLabel} /></View>
    <View style={styles.meta}><Icon name="CalendarDays" size={16} color={colors.text2} /><Text variant="bodySm" color={colors.text2}>{date}</Text></View>
    <View style={styles.meta}><Icon name="MapPin" size={16} color={colors.text2} /><Text variant="bodySm" color={colors.text2}>{scope}</Text></View>
  </View>;
}
const styles = StyleSheet.create({root:{gap:10},titleRow:{flexDirection:'row',alignItems:'flex-start',gap:12},title:{flex:1},meta:{flexDirection:'row',alignItems:'center',gap:6}});
