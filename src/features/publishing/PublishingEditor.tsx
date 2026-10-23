import Ionicons from '@expo/vector-icons/Ionicons';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputInstance,
  type TextInputSelectionChangeEvent,
} from 'react-native';
import type { UploadedImage } from '@/api/zhihu/image';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';
import { PublishingMediaList } from './PublishingMediaPicker';
import { serializePublishingMarkdown } from './serializer';
import type { PublishingDraftScope, PublishingMediaItem } from './types';
import { usePublishingMedia } from './usePublishingMedia';

type PublishingContentType = 'answer' | 'article' | 'question';

interface TextSelection {
  start: number;
  end: number;
}

interface PublishingEditorProps {
  autoFocus?: boolean;
  contentType: PublishingContentType;
  disabled?: boolean;
  minHeight?: number;
  onBusyChange?: (busy: boolean) => void;
  onChangeText: (value: string) => void;
  onImagesChange?: (images: UploadedImage[]) => void;
  placeholder: string;
  value: string;
  draftScope?: PublishingDraftScope | null;
  initialMedia?: PublishingMediaItem[];
  initialImages?: UploadedImage[];
  onMediaChange?: (items: PublishingMediaItem[]) => void;
}

interface ToolbarAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  key: string;
  label: string;
  onPress: () => void;
}

export function PublishingEditor({
  autoFocus = false,
  contentType,
  disabled = false,
  minHeight = 280,
  onBusyChange,
  onChangeText,
  onImagesChange,
  placeholder,
  value,
  draftScope = null,
  initialMedia = [],
  initialImages = [],
  onMediaChange,
}: PublishingEditorProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const inputRef = useRef<TextInputInstance>(null);
  const valueRef = useRef(value);
  const [selection, setSelection] = useState<TextSelection>({
    start: 0,
    end: 0,
  });
  const [isPreviewing, setIsPreviewing] = useState(false);
  const callbacks = useRef({ onMediaChange, onImagesChange, onChangeText });
  callbacks.current = { onMediaChange, onImagesChange, onChangeText };
  valueRef.current = value;
  const media = usePublishingMedia({
    scope: draftScope,
    initialItems: initialMedia,
    disabled,
    onChange: (items) => {
      callbacks.current.onMediaChange?.(items);
      const images = [
        ...initialImages.filter((image) =>
          valueRef.current.includes(image.src),
        ),
        ...items.flatMap((item) => (item.uploaded ? [item.uploaded] : [])),
      ];
      callbacks.current.onImagesChange?.(
        Array.from(
          new Map(images.map((image) => [image.imageId, image])).values(),
        ),
      );
    },
    onUploaded: (item) => {
      if (!item.uploaded || item.inserted) return;
      const image = item.uploaded;
      insertUploadedImages([
        `![图片](${image.src} "${image.width}x${image.height}")`,
      ]);
      media.markInserted(item.id);
    },
  });
  const uploadedImages = useMemo(
    () => [
      ...initialImages,
      ...media.items.flatMap((item) => (item.uploaded ? [item.uploaded] : [])),
    ],
    [initialImages, media.items],
  );
  const isBusy = media.isBusy;
  const isWorking = media.isWorking;
  const uploadingCount = media.uploadingCount;
  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  const focusAt = (nextSelection: TextSelection) => {
    setSelection(nextSelection);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps({ selection: nextSelection });
    });
  };

  const replaceSelection = (
    prefix: string,
    suffix: string,
    placeholderText: string,
  ) => {
    const selectedText = value.slice(selection.start, selection.end);
    const innerText = selectedText || placeholderText;
    const replacement = `${prefix}${innerText}${suffix}`;
    onChangeText(
      `${value.slice(0, selection.start)}${replacement}${value.slice(selection.end)}`,
    );
    const innerStart = selection.start + prefix.length;
    focusAt({
      start: innerStart,
      end: innerStart + innerText.length,
    });
  };

  const prefixSelectedLines = (prefix: string) => {
    const lineStart =
      value.lastIndexOf('\n', Math.max(0, selection.start - 1)) + 1;
    const nextLineBreak = value.indexOf('\n', selection.end);
    const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
    const selectedLines = value.slice(lineStart, lineEnd);
    const replacement = selectedLines
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
    onChangeText(
      `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    );
    focusAt({ start: lineStart, end: lineStart + replacement.length });
  };

  const insertUploadedImages = (imageMarkdown: string[]) => {
    if (imageMarkdown.length === 0) return;
    const currentValue = valueRef.current;
    const separator = currentValue.trimEnd() ? '\n\n' : '';
    const nextValue = `${currentValue.trimEnd()}${separator}${imageMarkdown.join('\n\n')}`;
    valueRef.current = nextValue;
    onChangeText(nextValue);
    focusAt({ start: nextValue.length, end: nextValue.length });
  };

  const toolbarActions: ToolbarAction[] = [
    {
      key: 'heading',
      icon: 'text-outline',
      label: '标题',
      onPress: () => prefixSelectedLines('# '),
    },
    {
      key: 'bold',
      icon: 'logo-buffer',
      label: '粗体',
      onPress: () => replaceSelection('**', '**', '粗体文字'),
    },
    {
      key: 'quote',
      icon: 'chatbox-ellipses-outline',
      label: '引用',
      onPress: () => prefixSelectedLines('> '),
    },
    {
      key: 'list',
      icon: 'list-outline',
      label: '列表',
      onPress: () => prefixSelectedLines('- '),
    },
    {
      key: 'link',
      icon: 'link-outline',
      label: '链接',
      onPress: () => replaceSelection('[', '](https://)', '链接文字'),
    },
    {
      key: 'code',
      icon: 'code-slash-outline',
      label: '代码',
      onPress: () => replaceSelection('```\n', '\n```', '代码'),
    },
    {
      key: 'image',
      icon: 'image-outline',
      label: '图片',
      onPress: () => void media.chooseImages(),
    },
  ];

  const previewHtml = useMemo(
    () => serializePublishingMarkdown(value, uploadedImages),
    [uploadedImages, value],
  );

  const handleSelectionChange = (event: TextInputSelectionChangeEvent) =>
    setSelection(event.nativeEvent.selection);

  return (
    <View className="bg-transparent">
      <View
        className="flex-row items-center justify-between border-b bg-transparent"
        style={{ borderBottomColor: colors.border }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          className="flex-1"
          contentContainerStyle={{ paddingVertical: 8, paddingRight: 8 }}
        >
          {toolbarActions.map((action) => (
            <BouncyButton
              key={action.key}
              disabled={disabled || isWorking || isPreviewing}
              onPress={action.onPress}
              className="items-center justify-center mr-1 px-2.5 py-1.5 rounded-lg"
              style={{
                opacity: disabled || isWorking || isPreviewing ? 0.4 : 1,
              }}
            >
              {action.key === 'image' && isWorking ? (
                <ActivityIndicator size="small" color={colors.link} />
              ) : (
                <Ionicons name={action.icon} size={20} color={colors.link} />
              )}
              <Text type="secondary" className="mt-0.5 text-[10px]">
                {action.label}
              </Text>
            </BouncyButton>
          ))}
        </ScrollView>
        <BouncyButton
          disabled={disabled || !value.trim()}
          onPress={() => setIsPreviewing((current) => !current)}
          className="px-3 py-2 rounded-lg"
          style={{ opacity: disabled || !value.trim() ? 0.4 : 1 }}
        >
          <Text type="primary" className="text-xs font-semibold">
            {isPreviewing ? '继续编辑' : '预览'}
          </Text>
        </BouncyButton>
      </View>

      {uploadingCount > 0 && (
        <View className="flex-row items-center py-2 bg-transparent">
          <ActivityIndicator size="small" color={colors.link} />
          <Text type="secondary" className="ml-2 text-xs">
            正在上传 {uploadingCount} 张图片，上传完成后会插入正文
          </Text>
        </View>
      )}

      <PublishingMediaList
        media={media}
        disabled={disabled}
        onRemove={(item) => {
          if (item.uploaded && item.inserted) {
            const image = item.uploaded;
            const next = valueRef.current.replace(
              `![图片](${image.src} "${image.width}x${image.height}")`,
              '',
            );
            valueRef.current = next;
            onChangeText(next);
          }
          media.remove(item.id);
        }}
      />

      {isPreviewing ? (
        <View style={{ minHeight }} className="pt-4 bg-transparent">
          <ZhihuContent
            content={previewHtml}
            objectId="publishing-preview"
            type={contentType}
            useNative
          />
        </View>
      ) : (
        <TextInput
          ref={inputRef}
          autoFocus={autoFocus}
          editable={!disabled}
          multiline
          onChangeText={onChangeText}
          onSelectionChange={handleSelectionChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          scrollEnabled={false}
          style={{
            minHeight,
            color: colors.text,
            fontSize: 17,
            lineHeight: 27,
            paddingHorizontal: 0,
            paddingVertical: 16,
            textAlignVertical: 'top',
          }}
          value={value}
        />
      )}

      <Text
        type="tertiary"
        className="pb-2 text-[11px]"
        style={{
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        }}
      >
        支持标题、粗体、引用、列表、链接、代码和图片；发布前可预览
      </Text>
    </View>
  );
}
