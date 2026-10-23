import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { uploadImage } from '@/api/zhihu/image';
import { publishingDraftRepository } from '@/storage/publishingDraftRepository';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import type { PublishingDraftScope, PublishingMediaItem } from './types';

interface Options {
  scope: PublishingDraftScope | null;
  initialItems?: PublishingMediaItem[];
  disabled?: boolean;
  maxImages?: number;
  source?: string;
  onChange?: (items: PublishingMediaItem[]) => void;
  onUploaded?: (item: PublishingMediaItem) => void;
}

let nextMediaId = 0;
const MAX_CONCURRENT_UPLOADS = 3;

export function usePublishingMedia(options: Options) {
  const [items, setItems] = useState(() =>
    (options.initialItems ?? []).map((item) =>
      item.status === 'uploading'
        ? { ...item, status: 'failed' as const }
        : item,
    ),
  );
  const [isPicking, setIsPicking] = useState(false);
  const itemsRef = useRef(items);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mountedRef = useRef(true);
  const sessionVersion = useRef(getAuthSessionVersion());
  const pickingRef = useRef(false);
  const pendingIds = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  const queue = useRef<Array<() => void>>([]);
  const activeCount = useRef(0);
  const current = () =>
    mountedRef.current && sessionVersion.current === getAuthSessionVersion();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const controller of controllers.current.values()) controller.abort();
      queue.current = [];
    };
  }, []);

  const commit = (next: PublishingMediaItem[]) => {
    if (!current()) return;
    itemsRef.current = next;
    setItems(next);
    optionsRef.current.onChange?.(next);
  };

  const upload = (id: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (
      !current() ||
      !item ||
      optionsRef.current.disabled ||
      pendingIds.current.has(id)
    )
      return;
    pendingIds.current.add(id);
    const controller = new AbortController();
    controllers.current.set(id, controller);
    commit(
      itemsRef.current.map((candidate) =>
        candidate.id === id ? { ...candidate, status: 'uploading' } : candidate,
      ),
    );
    const start = () => {
      if (!current() || controller.signal.aborted) {
        pendingIds.current.delete(id);
        controllers.current.delete(id);
        queue.current.shift()?.();
        return;
      }
      activeCount.current += 1;
      void uploadImage(item.asset, optionsRef.current.source ?? 'article', {
        signal: controller.signal,
      })
        .then((uploaded) => {
          if (
            !current() ||
            controller.signal.aborted ||
            !itemsRef.current.some((candidate) => candidate.id === id)
          )
            return;
          const updated = { ...item, status: 'uploaded' as const, uploaded };
          commit(
            itemsRef.current.map((candidate) =>
              candidate.id === id ? updated : candidate,
            ),
          );
          optionsRef.current.onUploaded?.(updated);
        })
        .catch((error: unknown) => {
          if (
            !current() ||
            controller.signal.aborted ||
            !itemsRef.current.some((candidate) => candidate.id === id)
          )
            return;
          commit(
            itemsRef.current.map((candidate) =>
              candidate.id === id
                ? { ...candidate, status: 'failed', uploaded: undefined }
                : candidate,
            ),
          );
          Alert.alert('图片上传失败', getZhihuErrorMessage(error));
        })
        .finally(() => {
          activeCount.current -= 1;
          pendingIds.current.delete(id);
          controllers.current.delete(id);
          if (current()) queue.current.shift()?.();
        });
    };
    if (activeCount.current < MAX_CONCURRENT_UPLOADS) start();
    else queue.current.push(start);
  };

  const chooseImages = async () => {
    const { scope, disabled, maxImages = 9 } = optionsRef.current;
    if (
      !current() ||
      !scope ||
      disabled ||
      pickingRef.current ||
      itemsRef.current.length >= maxImages
    )
      return;
    pickingRef.current = true;
    setIsPicking(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!current()) return;
      if (!permission.granted) {
        Alert.alert('需要相册权限', '请允许访问照片，才能添加图片。');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: maxImages - itemsRef.current.length,
        quality: 1,
      });
      if (!current() || result.canceled) return;
      const seen = new Set(itemsRef.current.map((item) => item.asset.uri));
      for (const asset of result.assets) {
        if (seen.has(asset.uri) || itemsRef.current.length >= maxImages)
          continue;
        seen.add(asset.uri);
        const id = `${Date.now()}-${nextMediaId++}`;
        const retained = await publishingDraftRepository.retainAsset(
          scope,
          id,
          asset,
        );
        if (!current()) {
          await publishingDraftRepository.releaseAsset(scope, retained.uri);
          return;
        }
        commit([
          ...itemsRef.current,
          { id, asset: retained, status: 'failed' },
        ]);
        upload(id);
      }
    } catch {
      if (current())
        Alert.alert(
          '选择图片失败',
          '无法保存图片，请检查相册权限和存储空间后重试。',
        );
    } finally {
      pickingRef.current = false;
      if (current()) setIsPicking(false);
    }
  };

  const remove = (id: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!current() || !item || optionsRef.current.disabled) return;
    controllers.current.get(id)?.abort();
    commit(itemsRef.current.filter((candidate) => candidate.id !== id));
    const scope = optionsRef.current.scope;
    if (scope)
      void publishingDraftRepository
        .releaseAsset(scope, item.asset.uri)
        .catch(() => {});
  };

  const markInserted = (id: string) =>
    commit(
      itemsRef.current.map((item) =>
        item.id === id ? { ...item, inserted: true } : item,
      ),
    );
  const uploadingCount = items.filter(
    (item) => item.status === 'uploading',
  ).length;
  const failedCount = items.filter((item) => item.status === 'failed').length;
  return {
    items,
    isPicking,
    uploadingCount,
    failedCount,
    isWorking: isPicking || uploadingCount > 0,
    isBusy: isPicking || uploadingCount > 0 || failedCount > 0,
    chooseImages,
    retry: upload,
    remove,
    markInserted,
  };
}
