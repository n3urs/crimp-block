import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

const NativeModule = Platform.OS === 'ios' ? requireNativeModule('RestTimerActivity') : null;

export function startRestActivity(secs: number, label: string, colour: string): void {
  NativeModule?.startRestActivity(secs, label, colour);
}

export function endRestActivity(cancelNotification: boolean): void {
  NativeModule?.endRestActivity(cancelNotification);
}
