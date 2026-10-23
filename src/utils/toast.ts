import { Platform, ToastAndroid } from 'react-native';
import Toast from 'react-native-root-toast';

export const showToast = (
  message: string,
  duration: 'short' | 'long' = 'short',
) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(
      message,
      duration === 'short' ? ToastAndroid.SHORT : ToastAndroid.LONG,
    );
  } else {
    Toast.show(message, {
      duration:
        duration === 'short' ? Toast.durations.SHORT : Toast.durations.LONG,
      position: -80, // 距离底部 80pt，避开 tab bar
      shadow: false,
      animation: true,
      hideOnPress: true,
      delay: 0,
      backgroundColor: 'rgba(30, 30, 30, 0.88)',
      textColor: '#FFFFFF',
      textStyle: {
        fontSize: 14,
        fontWeight: '500',
        letterSpacing: 0.2,
      },
      containerStyle: {
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 10,
        maxWidth: 280,
      },
      opacity: 1,
    });
  }
};
