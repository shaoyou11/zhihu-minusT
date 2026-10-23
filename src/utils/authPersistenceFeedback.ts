import { Alert } from 'react-native';
import { getAuthSessionVersion, saveAuthState } from '@/store/useAuthStore';

export async function persistAuthStateWithFeedback(): Promise<boolean> {
  const session = getAuthSessionVersion();
  const saved = await saveAuthState();
  if (session !== getAuthSessionVersion()) return false;
  if (!saved) {
    Alert.alert(
      '账号状态未保存',
      '当前操作已生效，但重启后可能恢复旧状态。请重试保存。',
      [
        { text: '稍后重试', style: 'cancel' },
        {
          text: '重试保存',
          onPress: () => void persistAuthStateWithFeedback(),
        },
      ],
    );
  }
  return saved;
}
