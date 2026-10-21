import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import {
  type NativeSyntheticEvent,
  Platform,
  type ViewProps,
} from 'react-native';

export interface KeyboardAnchorProps extends ViewProps {
  onOverlapChange: (event: NativeSyntheticEvent<{ height: number }>) => void;
}
export const nativeKeyboardAnchorAvailable =
  Platform.OS === 'ios' &&
  requireOptionalNativeModule('ZhihuKeyboardAnchor') !== null;
export const KeyboardAnchorNativeView: ComponentType<KeyboardAnchorProps> | null =
  nativeKeyboardAnchorAvailable
    ? requireNativeView<KeyboardAnchorProps>('ZhihuKeyboardAnchor')
    : null;
