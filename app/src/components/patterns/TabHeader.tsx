import React from 'react';
import { View } from 'react-native';
import { Text } from '../core';

export function TabHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return <View style={{ paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <Text variant="displayLg" upper style={{ flex: 1 }}>{title}</Text>{right}
  </View>;
}
