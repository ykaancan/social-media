import React, { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Text } from '../core';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';

/** Mounted only in JoinSheet's scan view; unmounting releases the camera. */
export function EventScanner({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState(false);
  const captured = useRef(false);
  if (!permission) return <Text>{t('common.loading')}</Text>;
  if (!permission.granted) return <>
    <Text>{t('eventFlow.cameraPermission')}</Text>
    <Button onPress={() => { void (permission.canAskAgain ? requestPermission() : Linking.openSettings()).catch(() => setError(true)); }}>
      {t(permission.canAskAgain ? 'eventFlow.allowCamera' : 'eventFlow.openSettings')}
    </Button>
    {error && <Text color={colors.danger}>{t('eventFlow.cameraError')}</Text>}
  </>;
  return <View style={styles.panel}>
    <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onMountError={() => setError(true)} onBarcodeScanned={({ data }) => {
        if (captured.current) return;
        const code = data.trim().toUpperCase().replace(/[\s-]/g, '');
        if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) { setError(true); return; }
        captured.current = true;
        onCode(code);
      }} />
    <Text style={styles.caption}>{t(error ? 'eventFlow.cameraError' : 'events.scanHint')}</Text>
  </View>;
}
const styles = StyleSheet.create({ panel: { height: 300, overflow: 'hidden', borderRadius: 14, backgroundColor: '#0b0b0b' },
  caption: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: '#ffffff', padding: 8 } });
