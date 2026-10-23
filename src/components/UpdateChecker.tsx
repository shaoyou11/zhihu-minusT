import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet } from 'react-native';
import {
  getGithubReleaseHistory,
  getLatestGithubRelease,
} from '@/api/githubReleases';
import { MarkdownText } from '@/components/MarkdownText';
import { AppDialog } from '@/components/overlays/AppDialog';
import { UpdateDownloadBar } from '@/components/UpdateDownloadBar';
import { useUpdateDownload } from '@/hooks/useUpdateDownload';
import { showToast } from '@/utils/toast';
import {
  assertUpdateActive,
  type GithubReleaseAsset,
  isTrustedReleaseUrl,
  MAX_CHECKSUM_BYTES,
  UpdateFailure,
} from '@/utils/updateSecurity';
import { isVersionNewer, selectAndroidApk } from '@/utils/updateSelection';

const IGNORED_VERSION_KEY = 'ignored_version_tag';

export interface ReleaseHistoryItem {
  name: string;
  notes: string;
  prerelease: boolean;
  publishedAt: string | null;
  tag: string;
  url: string;
}

export interface UpdateInfo {
  apkUrl?: string;
  apkAsset?: GithubReleaseAsset;
  checksumAsset?: GithubReleaseAsset;
  currentVersion: string;
  latestVersion: string;
  latestVersionTag: string;
  releaseNotes: string;
  releaseUrl: string;
  updateAvailable: boolean;
}

export async function getUpdateInfo(options?: {
  signal?: AbortSignal;
}): Promise<UpdateInfo> {
  const data = await getLatestGithubRelease(options);
  const latestVersion = data.tag.slice(1);
  const currentVersion =
    Constants.expoConfig?.version || Constants.nativeAppVersion || '0.0.0';
  const selected =
    Platform.OS === 'android'
      ? selectAndroidApk(data.assets, Device.supportedCpuArchitectures)
      : undefined;
  const checksumAsset = data.assets.find(
    (asset) =>
      asset.name === 'SHA256SUMS.txt' && asset.size <= MAX_CHECKSUM_BYTES,
  );
  // Old releases without a verifiable digest remain available in the browser.
  const apkAsset =
    selected && (selected.sha256 || checksumAsset) ? selected : undefined;
  return {
    apkUrl: apkAsset?.browser_download_url,
    apkAsset,
    checksumAsset,
    currentVersion,
    latestVersion,
    latestVersionTag: data.tag,
    releaseNotes: data.notes || '无更新说明',
    releaseUrl: data.url,
    updateAvailable: isVersionNewer(latestVersion, currentVersion),
  };
}

export async function getReleaseHistory(options?: {
  signal?: AbortSignal;
}): Promise<ReleaseHistoryItem[]> {
  return (await getGithubReleaseHistory(options)).map(
    ({ assets: _assets, ...release }) => release,
  );
}

export const useCheckUpdate = (
  onUpdateAvailable?: (info: UpdateInfo) => void,
) => {
  const onUpdateAvailableRef = useRef(onUpdateAvailable);
  onUpdateAvailableRef.current = onUpdateAvailable;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const updateInfo = await getUpdateInfo({ signal: controller.signal });
          assertUpdateActive(controller.signal);
          if (!updateInfo.updateAvailable) return;
          const ignored = await SecureStore.getItemAsync(IGNORED_VERSION_KEY);
          assertUpdateActive(controller.signal);
          if (ignored !== updateInfo.latestVersionTag)
            onUpdateAvailableRef.current?.(updateInfo);
        } catch (error) {
          if (!(error instanceof UpdateFailure && error.code === 'cancelled'))
            console.warn('检查更新失败');
        }
      })();
    }, 2000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
};

export const UpdateChecker: React.FC = () => {
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);
  const download = useUpdateDownload();
  useCheckUpdate(setPendingUpdate);

  if (!download.state && !pendingUpdate) return null;
  const closeUpdate = () => setPendingUpdate(null);
  const ignoreUpdate = async () => {
    if (!pendingUpdate) return;
    const versionTag = pendingUpdate.latestVersionTag;
    setPendingUpdate(null);
    await SecureStore.setItemAsync(IGNORED_VERSION_KEY, versionTag).catch(() =>
      showToast('无法保存忽略的版本'),
    );
  };
  const openRelease = () => {
    if (!pendingUpdate) return;
    const { releaseUrl, latestVersionTag } = pendingUpdate;
    if (!isTrustedReleaseUrl(releaseUrl, latestVersionTag)) {
      showToast('版本页面地址无效');
      return;
    }
    setPendingUpdate(null);
    const opening =
      Platform.OS === 'android'
        ? WebBrowser.openBrowserAsync(releaseUrl)
        : Linking.openURL(releaseUrl);
    void opening.catch(() => showToast('无法打开 GitHub 版本页面'));
  };
  const startDownload = () => {
    if (!pendingUpdate?.apkAsset) return;
    download.start({
      tag: pendingUpdate.latestVersionTag,
      asset: pendingUpdate.apkAsset,
      checksumAsset: pendingUpdate.checksumAsset,
    });
    setPendingUpdate(null);
  };

  return (
    <>
      {pendingUpdate ? (
        <AppDialog
          visible
          title={`发现新版本 ${pendingUpdate.latestVersionTag}`}
          icon="cloud-download-outline"
          message="有新的版本可用"
          onClose={closeUpdate}
          actions={[
            { label: '稍后', onPress: closeUpdate },
            {
              label: '忽略此版本',
              onPress: () => void ignoreUpdate(),
              variant: 'destructive',
            },
            ...(pendingUpdate.apkAsset
              ? [
                  {
                    label: '直接更新',
                    onPress: startDownload,
                    variant: 'primary' as const,
                  },
                ]
              : []),
            {
              label: '去下载（GitHub）',
              onPress: openRelease,
              variant: 'secondary',
            },
          ]}
        >
          <ScrollView
            nestedScrollEnabled
            style={styles.updateNotes}
            contentContainerStyle={styles.updateNotesContent}
          >
            <MarkdownText markdown={pendingUpdate.releaseNotes} />
          </ScrollView>
        </AppDialog>
      ) : null}
      {download.state ? (
        <UpdateDownloadBar
          state={download.state}
          onCancel={download.cancel}
          onDismiss={download.dismiss}
          onInstall={download.install}
          onRetry={download.retry}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  updateNotes: { width: '100%', maxHeight: 300, marginTop: 4 },
  updateNotesContent: { paddingBottom: 2 },
});
