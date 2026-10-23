import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';
import type { UploadedImage } from '@/api/zhihu/image';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { PublishingDraftScope, PublishingMediaItem } from './types';
import { usePublishingMedia } from './usePublishingMedia';

interface PublishingMediaPickerProps {
  disabled?: boolean;
  maxImages?: number;
  onBusyChange?: (busy: boolean) => void;
  onImagesChange: (images: UploadedImage[]) => void;
  uploadSource?: string;
  draftScope?: PublishingDraftScope | null;
  initialMedia?: PublishingMediaItem[];
  onMediaChange?: (items: PublishingMediaItem[]) => void;
}

export function PublishingMediaPicker({
  disabled = false,
  maxImages = 9,
  onBusyChange,
  onImagesChange,
  uploadSource = 'article',
  draftScope = null,
  initialMedia = [],
  onMediaChange,
}: PublishingMediaPickerProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const media = usePublishingMedia({
    scope: draftScope,
    initialItems: initialMedia,
    disabled,
    maxImages,
    source: uploadSource,
    onChange: onMediaChange,
  });
  const { items, isPicking, uploadingCount, failedCount, isBusy } = media;
  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);
  useEffect(() => {
    onImagesChange(
      items.flatMap((item) => (item.uploaded ? [item.uploaded] : [])),
    );
  }, [items, onImagesChange]);
  return (
    <View className="py-3 bg-transparent">
      <PublishingMediaList media={media} disabled={disabled} />

      <BouncyButton
        disabled={disabled || isBusy || items.length >= maxImages}
        onPress={() => void media.chooseImages()}
        className="self-start flex-row items-center rounded-xl border px-4 py-2.5"
        style={{
          borderColor: colors.border,
          opacity: disabled || isBusy || items.length >= maxImages ? 0.45 : 1,
        }}
      >
        {isPicking ? (
          <ActivityIndicator size="small" color={colors.link} />
        ) : (
          <Ionicons name="images-outline" size={20} color={colors.link} />
        )}
        <Text type="primary" className="ml-2 text-sm font-semibold">
          {uploadingCount > 0
            ? `正在上传 ${uploadingCount} 张`
            : failedCount > 0
              ? `${failedCount} 张上传失败，请重试`
              : `添加图片（${items.length}/${maxImages}）`}
        </Text>
      </BouncyButton>
    </View>
  );
}

export function PublishingMediaList({
  media,
  disabled,
  onRemove,
}: {
  media: ReturnType<typeof usePublishingMedia>;
  disabled?: boolean;
  onRemove?: (item: PublishingMediaItem) => void;
}) {
  const { items } = media;
  const colors = Colors[useColorScheme()];
  return (
    <>
      {items.length > 0 && (
        <View className="flex-row flex-wrap bg-transparent">
          {items.map((item) => (
            <View key={item.id} className="mr-3 mb-3 bg-transparent">
              <Image
                source={{ uri: item.uploaded?.src ?? item.asset.uri }}
                style={{ width: 84, height: 84, borderRadius: 10 }}
              />
              {item.status !== 'uploaded' && (
                <View
                  style={{
                    ...StyleSheet.absoluteFill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 10,
                    backgroundColor: 'rgba(0,0,0,0.48)',
                  }}
                >
                  {item.status === 'uploading' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <BouncyButton
                      disabled={disabled}
                      onPress={() => media.retry(item.id)}
                      className="items-center p-2"
                    >
                      <Ionicons name="refresh" color="#fff" size={22} />
                      <Text style={{ color: '#fff', fontSize: 10 }}>重试</Text>
                    </BouncyButton>
                  )}
                </View>
              )}
              <BouncyButton
                disabled={disabled}
                onPress={() =>
                  onRemove ? onRemove(item) : media.remove(item.id)
                }
                style={{ position: 'absolute', right: -7, top: -7 }}
              >
                <Ionicons
                  name="close-circle"
                  size={22}
                  color={colors.textSecondary}
                />
              </BouncyButton>
            </View>
          ))}
        </View>
      )}
    </>
  );
}
