import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Toast, type ToastTone } from '../core/Toast';
import type { IconName } from '../core/Icon';

export interface ToastOptions {
  tone?: ToastTone;
  action?: string;
  onAction?: () => void;
  /** `null` hides the tone's glyph. */
  icon?: IconName | null;
  /** Auto-dismiss after this many ms. The prototype's `say()` uses 2600. */
  durationMs?: number;
}

export interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
  hide: () => void;
}

interface Shown extends ToastOptions {
  key: number;
  message: string;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 2600;
/** The prototype's `bottom: 150` minus its hard-coded 34px home indicator. */
const ABOVE_THUMB_ZONE = 116;
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * One app-wide toast slot, mounted once in `App.tsx` above the navigator so a
 * toast survives a screen change (e.g. "Sent" after the composer closes).
 *
 * Every prototype has a local `say(message)` that shows one toast at a time,
 * positioned above the thumb zone, and clears it after 2.6 s — this is that,
 * as a library pattern so screens do not each rebuild it [D1]. `Toast` itself
 * stays presentational.
 */
export function ToastHost({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setShown(null);
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      if (timer.current) clearTimeout(timer.current);
      setShown({ key: Date.now(), message, ...options });
      timer.current = setTimeout(() => {
        timer.current = null;
        setShown(null);
      }, options.durationMs ?? DEFAULT_DURATION);
    },
    []
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {shown ? (
        <View
          pointerEvents="box-none"
          style={[styles.slot, { bottom: ABOVE_THUMB_ZONE + Math.max(insets.bottom, 34) }]}
        >
          <Toast
            key={shown.key}
            testID="toast"
            message={shown.message}
            tone={shown.tone}
            icon={shown.icon}
            action={shown.action}
            onAction={() => {
              shown.onAction?.();
              hide();
            }}
          />
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast.show(t('composer.sent'))`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast() needs a <ToastHost> above it (mounted in App.tsx).');
  return api;
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 7,
  },
});
