import { Alert, TextInput } from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';
import type { PublishingDocument } from './document';

export function PublishingDocumentEditor({
  document,
  onChange,
  disabled,
  contentType = 'answer',
}: {
  document: PublishingDocument;
  onChange: (document: PublishingDocument) => void;
  disabled?: boolean;
  contentType?: 'answer' | 'pin';
}) {
  const colors = Colors[useColorScheme()];
  return (
    <View className="bg-transparent">
      <Text type="secondary" className="text-xs mb-3">
        普通段落可以修改；复杂内容会原样保留。新增内容可在下方继续编辑。
      </Text>
      {document.blocks.map((block) =>
        block.kind === 'preserved' && !block.visible ? null : (
          <View
            key={block.id}
            className="mb-4 p-3 rounded-xl bg-transparent"
            style={{ borderWidth: 1, borderColor: colors.border }}
          >
            {block.kind === 'markdown' ? (
              <TextInput
                accessibilityLabel={
                  contentType === 'pin' ? '原想法段落' : '原回答段落'
                }
                editable={!disabled}
                multiline
                value={block.value}
                style={{
                  color: colors.text,
                  fontSize: 17,
                  lineHeight: 27,
                  minHeight: 60,
                  textAlignVertical: 'top',
                }}
                onChangeText={(value) =>
                  onChange({
                    ...document,
                    blocks: document.blocks.map((current) =>
                      current.id === block.id && current.kind === 'markdown'
                        ? { ...current, value }
                        : current,
                    ),
                  })
                }
              />
            ) : (
              <>
                <ZhihuContent
                  content={block.html}
                  type={contentType}
                  objectId={`publishing-${block.id}`}
                  useNative
                />
                <Text type="secondary" className="text-xs mt-2">
                  这段复杂内容将原样保留
                </Text>
              </>
            )}
            <BouncyButton
              disabled={disabled}
              onPress={() =>
                Alert.alert(
                  '删除这段内容？',
                  `保存${contentType === 'pin' ? '想法' : '回答'}后，这段内容也会从线上内容中删除。`,
                  [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '删除',
                      style: 'destructive',
                      onPress: () =>
                        onChange({
                          ...document,
                          blocks: document.blocks.filter(
                            (current) => current.id !== block.id,
                          ),
                        }),
                    },
                  ],
                )
              }
              className="self-end mt-2"
            >
              <Text type="primary" className="text-xs">
                删除此段
              </Text>
            </BouncyButton>
          </View>
        ),
      )}
    </View>
  );
}
