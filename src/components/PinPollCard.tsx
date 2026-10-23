import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { votePinPoll } from '@/api/zhihu/pin';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { ZhihuPinPoll } from '@/types/zhihu';

export function PinPollCard({
  poll,
  contentId,
}: {
  poll: ZhihuPinPoll;
  contentId: string;
}) {
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const linkColor = useThemeColor({}, 'link');
  const onPrimaryColor = useThemeColor({}, 'onPrimary');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');
  const borderColor = Colors[colorScheme].border;
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const submittingRef = useRef(false);
  const mutation = useMutation({
    mutationFn: (optionIds: string[]) => votePinPoll(poll.id, optionIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['pin-detail', contentId],
        exact: true,
      });
    },
    onError: () => {
      Alert.alert('投票失败', '知乎没有接受这次投票，请稍后重试。');
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });
  const now = Math.floor(Date.now() / 1000);
  const acceptsVote =
    poll.is_reviewing !== true &&
    (poll.end_at === undefined || poll.end_at < 0 || poll.end_at > now);
  const resultMode =
    poll.is_voted === true || mutation.isSuccess || !acceptsVote;
  const totalVotes = poll.member_count || poll.voting_count || 0;
  const configuredLimit = poll.max_selections ?? 1;
  const maxSelections =
    Number.isSafeInteger(configuredLimit) && configuredLimit > 0
      ? Math.min(configuredLimit, poll.options.length)
      : 1;
  const selected = selectedIds
    .filter((id) => poll.options.some((option) => option.id === id))
    .slice(0, maxSelections);
  const submit = () => {
    if (
      submittingRef.current ||
      mutation.isPending ||
      resultMode ||
      selected.length === 0
    )
      return;
    submittingRef.current = true;
    mutation.mutate([...selected]);
  };

  return (
    <View
      className="mt-4 rounded-2xl p-4"
      style={{
        borderWidth: StyleSheet.hairlineWidth,
        borderColor,
        backgroundColor: Colors[colorScheme].backgroundSecondary,
      }}
    >
      <Text className="font-bold text-base">{poll.title || '想法投票'}</Text>
      <Text type="secondary" className="text-xs mt-1 mb-3">
        {resultMode
          ? poll.is_reviewing
            ? '投票审核中'
            : poll.end_at !== undefined &&
                poll.end_at >= 0 &&
                poll.end_at <= now
              ? `投票已结束 · ${totalVotes} 人参与`
              : `${totalVotes} 人参与`
          : maxSelections > 1
            ? `最多选择 ${maxSelections} 项 · 已选 ${selected.length} 项`
            : '请选择一个选项'}
      </Text>
      {poll.options.map((option) => {
        if (resultMode) {
          const percentage =
            totalVotes > 0
              ? Math.round(((option.voting_count || 0) / totalVotes) * 100)
              : 0;
          return (
            <View key={option.id} className="mb-2">
              <View className="flex-row justify-between mb-1">
                <Text className="text-sm flex-1" numberOfLines={1}>
                  {option.title}
                </Text>
                <Text type="secondary" className="text-xs ml-2">
                  {percentage}%
                </Text>
              </View>
              <View
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: borderColor }}
              >
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor:
                      option.is_selected ||
                      (mutation.isSuccess &&
                        mutation.variables?.includes(option.id))
                        ? primaryColor
                        : Colors[colorScheme].textSecondary,
                  }}
                />
              </View>
            </View>
          );
        }
        const checked = selected.includes(option.id);
        const disabled =
          mutation.isPending ||
          (maxSelections > 1 && !checked && selected.length >= maxSelections);
        return (
          <BouncyButton
            key={option.id}
            accessibilityRole={maxSelections > 1 ? 'checkbox' : 'radio'}
            accessibilityLabel={option.title}
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={() => {
              if (submittingRef.current || disabled) return;
              setSelectedIds((current) => {
                const available = current.filter((id) =>
                  poll.options.some((candidate) => candidate.id === id),
                );
                if (available.includes(option.id))
                  return available.filter((id) => id !== option.id);
                if (maxSelections === 1) return [option.id];
                return available.length < maxSelections
                  ? [...available, option.id]
                  : available;
              });
            }}
            className="rounded-xl px-3 py-2.5 mb-2"
            style={{
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: checked ? primaryColor : borderColor,
              backgroundColor: checked ? primaryTransparent : 'transparent',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Text style={{ color: linkColor }} className="text-sm">
              {checked ? '✓ ' : ''}
              {option.title}
            </Text>
          </BouncyButton>
        );
      })}
      {!resultMode && (
        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel="提交投票"
          accessibilityState={{ busy: mutation.isPending }}
          disabled={mutation.isPending || selected.length === 0}
          onPress={submit}
          className="rounded-xl px-3 py-2.5 mt-1 items-center"
          style={{
            backgroundColor: primaryColor,
            opacity: selected.length === 0 ? 0.5 : 1,
          }}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={onPrimaryColor} />
          ) : (
            <Text style={{ color: onPrimaryColor }} className="font-semibold">
              提交投票
            </Text>
          )}
        </BouncyButton>
      )}
    </View>
  );
}
