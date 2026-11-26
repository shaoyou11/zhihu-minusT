import { cssInterop } from 'nativewind';
import { type ColorValue, StyleSheet } from 'react-native';
import {
  ActionIconCount,
  countedActionButtonStyle,
} from '@/components/ActionIconCount';
import {
  BouncyButton,
  type BouncyButtonProps,
} from '@/components/BouncyButton';

/** Shared capsule feedback for controls in content action rows. */
export function ContentActionButton({
  accessibilityRole = 'button',
  cornerCount,
  children,
  style,
  ...props
}: BouncyButtonProps & {
  cornerCount?: { value?: number; color?: ColorValue };
}) {
  return (
    <BouncyButton
      {...props}
      accessibilityRole={accessibilityRole}
      style={[styles.button, cornerCount && countedActionButtonStyle, style]}
    >
      {cornerCount ? (
        <ActionIconCount count={cornerCount.value} color={cornerCount.color}>
          {children}
        </ActionIconCount>
      ) : (
        children
      )}
    </BouncyButton>
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
