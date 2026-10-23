import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import type { usePublishingDraft } from './usePublishingDraft';

export function PublishingDraftNotice({
  draft,
}: {
  draft: ReturnType<typeof usePublishingDraft>;
}) {
  return (
    <View className="py-2 bg-transparent">
      <Text type="secondary" className="text-xs">
        {!draft.scope
          ? '请先登录并等待账号资料加载，才能编辑和保存草稿'
          : draft.readFailed
            ? '本地草稿暂时无法读取，重试成功后可继续编辑'
            : !draft.ready
              ? '正在恢复本地草稿…'
              : draft.status === 'failed'
                ? '草稿未保存，点下方按钮重试'
                : draft.dirty
                  ? draft.status === 'saved'
                    ? '本地草稿已保存'
                    : '正在保存本地草稿…'
                  : '编辑内容会自动保存到当前账号的本地草稿'}
      </Text>
      {draft.readFailed && (
        <>
          <BouncyButton onPress={draft.retryRead}>
            <Text type="primary">重试读取草稿</Text>
          </BouncyButton>
          <BouncyButton onPress={draft.discardUnreadable}>
            <Text type="primary">删除本地草稿并重新开始</Text>
          </BouncyButton>
        </>
      )}
      {draft.status === 'failed' && !draft.readFailed && (
        <BouncyButton onPress={() => void draft.save()}>
          <Text type="primary">重试保存草稿</Text>
        </BouncyButton>
      )}
      {draft.hasConflict && (
        <View className="bg-transparent">
          <Text type="secondary" className="text-xs">
            线上内容已变化，请先选择要继续编辑的版本
          </Text>
          <BouncyButton onPress={draft.restoreConflict}>
            <Text type="primary">恢复旧草稿</Text>
          </BouncyButton>
          <BouncyButton onPress={draft.discardConflict}>
            <Text type="primary">使用线上版本并删除旧草稿</Text>
          </BouncyButton>
        </View>
      )}
    </View>
  );
}
