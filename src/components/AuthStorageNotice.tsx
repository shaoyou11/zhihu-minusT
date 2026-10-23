import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { isPersistenceNativeAvailable } from '@/modules/zhihu-persistence';
import { useAuthPersistenceStatus } from '@/store/useAuthPersistenceStatus';
import {
  getAuthSessionVersion,
  resetSavedAuthState,
  retryAuthPersistence,
  useAuthStore,
} from '@/store/useAuthStore';
import { syncNativeSessionCookies } from '@/utils/authSession';
import { showToast } from '@/utils/toast';
import { BouncyButton } from './BouncyButton';
import { Text, View } from './Themed';

export function AuthStorageNotice() {
  const nativeAvailable = isPersistenceNativeAvailable();
  const failed = useAuthPersistenceStatus((state) => state.failed);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const queryClient = useQueryClient();

  const retry = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const session = getAuthSessionVersion();
    try {
      const restored = await retryAuthPersistence();
      if (restored && session !== getAuthSessionVersion()) {
        queryClient.clear();
        await syncNativeSessionCookies(useAuthStore.getState().cookies);
      }
      showToast(restored ? '账号状态已保存' : '账号仍无法恢复，请稍后重试');
    } catch {
      showToast('账号仍无法恢复，请稍后重试');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const reset = () =>
    Alert.alert(
      '清除本地账号',
      '这会清除本机保存的所有登录账号，之后需要重新登录。确定继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除账号',
          style: 'destructive',
          onPress: () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            void (async () => {
              try {
                if (!(await resetSavedAuthState())) {
                  showToast('清除失败，请重试');
                  return;
                }
                queryClient.clear();
                await syncNativeSessionCookies(null);
                showToast('本地账号已清除');
              } catch {
                showToast('清除失败，请重试');
              } finally {
                inFlight.current = false;
                setBusy(false);
              }
            })();
          },
        },
      ],
    );

  if (!failed) return null;
  return (
    <View type="surface" className="p-4 mb-3 rounded-xl">
      <Text>
        {nativeAvailable
          ? '已保存账号暂时无法读取或保存。请先重试，原文件会保留。'
          : '当前开发包缺少安全存储模块，请重新编译或更新应用。原账号文件会保留。'}
      </Text>
      <View className="flex-row bg-transparent mt-2">
        <BouncyButton
          disabled={busy || !nativeAvailable}
          onPress={() => void retry()}
          className="p-2"
        >
          <Text type="primary">{busy ? '正在恢复…' : '重试保存与恢复'}</Text>
        </BouncyButton>
        <BouncyButton
          disabled={busy || !nativeAvailable}
          onPress={reset}
          className="p-2"
        >
          <Text type="danger">清除本地账号</Text>
        </BouncyButton>
      </View>
    </View>
  );
}
