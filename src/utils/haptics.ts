import * as ExpoHaptics from 'expo-haptics';
import { useSettingsStore } from '@/store/useSettingsStore';

export {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
} from 'expo-haptics';

function isHapticFeedbackEnabled(): boolean {
  return useSettingsStore.getState().enableHapticFeedback;
}

export async function impactAsync(
  style: ExpoHaptics.ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle
    .Medium,
): Promise<void> {
  if (!isHapticFeedbackEnabled()) return;
  await ExpoHaptics.impactAsync(style);
}

export async function notificationAsync(
  type: ExpoHaptics.NotificationFeedbackType = ExpoHaptics
    .NotificationFeedbackType.Success,
): Promise<void> {
  if (!isHapticFeedbackEnabled()) return;
  await ExpoHaptics.notificationAsync(type);
}

export async function selectionAsync(): Promise<void> {
  if (!isHapticFeedbackEnabled()) return;
  await ExpoHaptics.selectionAsync();
}
