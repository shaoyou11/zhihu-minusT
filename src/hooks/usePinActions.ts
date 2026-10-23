import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { deletePin } from '@/api/zhihu/pin';
import type { ActionSheetOption } from '@/components/overlays/ActionSheet';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import type { ZhihuPin } from '@/types/zhihu';
import { isPinOwner } from '@/utils/pinOwnership';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

interface PinActionAttempt {
  scope: string;
  session: number;
  pin: Pick<ZhihuPin, 'id' | 'author'>;
}

export function usePinActions(
  pin: Pick<ZhihuPin, 'id' | 'author'> | undefined,
): ActionSheetOption[] {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useAuthStore((state) => state.me);
  const authenticated = useAuthStore((state) => Boolean(state.cookies));
  const session = getAuthSessionVersion();
  const scope = `${pin?.id ?? ''}:${session}`;
  const currentScope = useRef<string | null>(scope);
  currentScope.current = scope;
  const pending = useRef<PinActionAttempt | null>(null);
  useEffect(() => {
    currentScope.current = scope;
    return () => {
      currentScope.current = null;
    };
  }, [scope]);
  const current = (attempt = { scope, session }) =>
    currentScope.current === attempt.scope &&
    attempt.session === getAuthSessionVersion();
  const mutation = useMutation({
    mutationFn: async (attempt: PinActionAttempt) => {
      if (
        !current(attempt) ||
        !isPinOwner(
          attempt.pin.author,
          useAuthStore.getState().me,
          Boolean(useAuthStore.getState().cookies),
        )
      )
        throw new Error('登录会话已变化，请重新打开想法');
      await deletePin(attempt.pin.id);
    },
    onSuccess: (_data, attempt) => {
      if (!current(attempt)) return;
      for (const key of [
        'pin-detail',
        'zhihu-feed',
        'user-recent-published-activities',
        'user-pins',
        'user-activities',
      ])
        void queryClient.invalidateQueries({ queryKey: [key] });
      Alert.alert('删除成功', '想法已删除');
      router.back();
    },
    onError: (error: unknown, attempt) => {
      if (current(attempt))
        Alert.alert('删除失败', getZhihuErrorMessage(error));
    },
    onSettled: (_data, _error, attempt) => {
      if (pending.current === attempt) pending.current = null;
    },
  });
  if (!pin || !isPinOwner(pin.author, me, authenticated)) return [];
  return [
    {
      key: 'edit-pin',
      label: '编辑想法',
      icon: 'create-outline',
      disabled: mutation.isPending,
      onPress: () => {
        if (current())
          router.push({
            pathname: '/publish/pin',
            params: { id: String(pin.id) },
          });
      },
    },
    {
      key: 'delete-pin',
      label: '删除想法',
      icon: 'trash-outline',
      destructive: true,
      disabled: mutation.isPending,
      onPress: () => {
        if (!current() || pending.current) return;
        Alert.alert('删除想法？', '删除后无法恢复。', [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: () => {
              if (!current() || pending.current) return;
              const attempt = { scope, session, pin };
              pending.current = attempt;
              mutation.mutate(attempt);
            },
          },
        ]);
      },
    },
  ];
}
