import { cssInterop } from 'nativewind';
import { StyleSheet } from 'react-native';
import {
  BouncyButton,
  type BouncyButtonProps,
} from '@/components/BouncyButton';

/** Shared capsule feedback for controls in content action rows. */
export function ContentActionButton({
  accessibilityRole = 'button',
  style,
  ...props
}: BouncyButtonProps) {
  return (
    <BouncyButton
      {...props}
      accessibilityRole={accessibilityRole}
      style={[styles.button, style]}
    />
  );
}

cssInterop(ContentActionButton, { className: 'style' });

const styles = StyleSheet.create({
  button: {
    borderRadius: 99,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
});
