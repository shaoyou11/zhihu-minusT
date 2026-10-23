import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { createPin, getPin, getPinDraft, savePinDraft } from '@/api/zhihu/pin';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { isPinOwner } from '@/utils/pinOwnership';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import {
  createPublishingDocument,
  hasPublishingDocumentContent,
  serializePublishingDocument,
} from './document';
import { serializePinText } from './serializer';
import { emptyPublishingDraft, type PublishingMediaItem } from './types';
import { usePublishingDraft } from './usePublishingDraft';

export function usePinEditor(pinId?: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = getAuthSessionVersion();
  const [mediaBusy, setMediaBusy] = useState(false);
  const [pending, setPending] = useState<'publish' | 'save' | 'load' | null>(
    null,
  );
  const [mediaRevision, setMediaRevision] = useState(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () => mounted.current && session === getAuthSessionVersion();
  const existing = useQuery({
    queryKey: ['pin-edit', pinId, session],
    queryFn: async ({ signal }) => {
      const pin = await getPin(pinId as string, { signal });
      if (
        !current() ||
        !isPinOwner(
          pin.author,
          useAuthStore.getState().me,
          Boolean(useAuthStore.getState().cookies),
        )
      )
        throw new Error('只能编辑当前账号发布的想法');
      return getPinDraft(pinId as string, { signal });
    },
    enabled: Boolean(pinId),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const initial = useMemo(
    () =>
      existing.data
        ? {
            ...emptyPublishingDraft(),
            title: existing.data.title,
            document: createPublishingDocument(existing.data.html),
            images: existing.data.images,
            pinSourceData: existing.data.sourceData,
          }
        : emptyPublishingDraft(),
    [existing.data],
  );
  const draft = usePublishingDraft(
    'pin',
    pinId ?? 'new',
    initial,
    !pinId || Boolean(existing.data),
    mediaBusy,
    pending !== null,
  );
  const { images, media, document, content } = draft.value;
  const remoteImages = useMemo(
    () => images.filter((image) => image.imageId.startsWith('pin-')),
    [images],
  );
  const setImages = useCallback(
    (uploaded: typeof images) => {
      const next = [...remoteImages, ...uploaded];
      if (JSON.stringify(images) !== JSON.stringify(next))
        draft.update({ images: next });
    },
    [images, remoteImages, draft.update],
  );
  const setMedia = useCallback(
    (value: PublishingMediaItem[]) => draft.update({ media: value }),
    [draft.update],
  );
  const hasContent = Boolean(
    content.trim() ||
      images.length ||
      (document && hasPublishingDocumentContent(document)),
  );
  const enabled = draft.ready && !draft.hasConflict && !mediaBusy && !pending;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const html = () =>
    (document ? serializePublishingDocument(document, images) : '') +
    serializePinText(content);
  const options = () => ({
    pinId,
    draftId: draft.value.pinDraftId,
    title: draft.value.title,
    images,
    sourceData: draft.value.pinSourceData,
  });
  const start = (operation: NonNullable<typeof pending>) => {
    if (lock.current || !current() || !enabledRef.current) return false;
    lock.current = true;
    setPending(operation);
    return true;
  };
  const finish = () => {
    lock.current = false;
    if (current()) setPending(null);
  };
  const saveCloud = async () => {
    if (!start('save')) return;
    try {
      if (!(await draft.save())) return;
      if (!current()) return;
      const id = await savePinDraft(html(), options());
      if (!current()) return;
      const value = { ...draft.value, pinDraftId: id };
      draft.update({ pinDraftId: id });
      const saved = await draft.save(value);
      if (current())
        Alert.alert(
          '云端草稿已保存',
          saved
            ? '可在此页面继续编辑或读取云端草稿。'
            : '云端已保存，但本地草稿保存失败，请重试本地保存。',
        );
    } catch (error: unknown) {
      if (current()) Alert.alert('草稿保存失败', getZhihuErrorMessage(error));
    } finally {
      finish();
    }
  };
  const loadCloud = () => {
    const id = pinId ?? draft.value.pinDraftId;
    if (!id || !enabled || lock.current) return;
    Alert.alert('读取云端草稿？', '将用云端草稿替换当前编辑内容和图片。', [
      { text: '取消', style: 'cancel' },
      {
        text: '读取',
        onPress: () => {
          if (!start('load')) return;
          void getPinDraft(id)
            .then((loaded) => {
              if (!current()) return;
              draft.update({
                title: loaded.title,
                content: '',
                document: createPublishingDocument(loaded.html),
                images: loaded.images,
                media: [],
                pinDraftId: id,
                pinSourceData: loaded.sourceData,
              });
              setMediaRevision((revision) => revision + 1);
            })
            .catch((error: unknown) => {
              if (current())
                Alert.alert('草稿加载失败', getZhihuErrorMessage(error));
            })
            .finally(finish);
        },
      },
    ]);
  };
  const publish = async () => {
    if (!hasContent || !start('publish')) return;
    try {
      let draftId = draft.value.pinDraftId;
      if (!pinId && !draftId) {
        draftId = await savePinDraft(html(), options());
        if (!current()) return;
        draft.update({ pinDraftId: draftId });
      }
      if (
        !pinId &&
        !(await draft.save({ ...draft.value, pinDraftId: draftId }))
      )
        return;
      if (!current()) return;
      await createPin(html(), { ...options(), draftId });
      if (!current()) return;
      await draft.completePublished();
      if (!current()) return;
      for (const key of [
        'zhihu-feed',
        'pin-detail',
        'user-recent-published-activities',
        'user-pins',
        'user-activities',
      ])
        void queryClient.invalidateQueries({ queryKey: [key] });
      Alert.alert(
        pinId ? '修改已保存' : '发布成功',
        pinId ? '你的想法已更新。' : '你的想法已发布。',
      );
      router.back();
    } catch (error: unknown) {
      if (current())
        Alert.alert(
          pinId ? '修改失败' : '发布失败',
          getZhihuErrorMessage(error),
        );
    } finally {
      finish();
    }
  };
  return {
    draft,
    existing,
    remoteImages,
    setImages,
    setMedia,
    setMediaBusy,
    mediaRevision,
    media,
    pending,
    enabled,
    hasContent,
    saveCloud,
    loadCloud,
    publish,
  };
}
