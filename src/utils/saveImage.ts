import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  ImpactFeedbackStyle,
  impactAsync,
  NotificationFeedbackType,
  notificationAsync,
} from '@/utils/haptics';
import { showToast } from '@/utils/toast';

// 动态安全加载 expo-media-library 原生模块，避免在 Expo Go 或未编译原生包时崩溃
let MediaLibrary: typeof import('expo-media-library/legacy') | null = null;
try {
  MediaLibrary = require('expo-media-library/legacy');
} catch (_e) {
  console.warn(
    '[saveImage] ExpoMediaLibrary 原生模块未就绪，将降级使用系统分享组件保存',
  );
}

/**
 * 从网络 URL 或本地 URI 保存图片至手机相册
 */
export async function saveImageToGallery(imageUrl: string): Promise<boolean> {
  try {
    void impactAsync(ImpactFeedbackStyle.Medium);

    // 1. 下载图片到本地临时目录
    showToast('正在准备图片...');
    let targetUri = imageUrl;

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const cleanUrl = imageUrl.split('?')[0];
      let ext = cleanUrl.split('.').pop()?.toLowerCase();
      if (!ext || !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        ext = 'jpg';
      }

      const tempDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const fileUri = `${tempDir}downloaded_${Date.now()}.${ext}`;

      const downloadRes = await FileSystem.downloadAsync(imageUrl, fileUri);
      if (downloadRes.status !== 200) {
        showToast('图片下载失败，请稍后重试');
        return false;
      }
      targetUri = downloadRes.uri;
    }

    // 2. 检查并使用 MediaLibrary 保存
    if (MediaLibrary) {
      const { status, granted } = await MediaLibrary.requestPermissionsAsync();
      if (granted || status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(targetUri);
        void notificationAsync(NotificationFeedbackType.Success);
        showToast('图片已保存至系统相册');
        cleanupTempFile(targetUri, imageUrl);
        return true;
      }
    }

    // 3. 降级方案：若 MediaLibrary 不可用或未获权限，呼出系统分享界面由用户另存
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(targetUri, {
        dialogTitle: '保存/分享图片',
        mimeType: 'image/*',
      });
      cleanupTempFile(targetUri, imageUrl);
      return true;
    }

    showToast('当前设备未获得相册权限，无法保存');
    cleanupTempFile(targetUri, imageUrl);
    return false;
  } catch {
    console.error('保存图片失败');
    showToast('保存图片失败');
    return false;
  }
}

/**
 * 分享图片
 */
export async function shareImage(imageUrl: string): Promise<boolean> {
  try {
    void impactAsync(ImpactFeedbackStyle.Light);

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      showToast('当前设备不支持分享功能');
      return false;
    }

    let targetUri = imageUrl;

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const cleanUrl = imageUrl.split('?')[0];
      let ext = cleanUrl.split('.').pop()?.toLowerCase();
      if (!ext || !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        ext = 'jpg';
      }

      const tempDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const fileUri = `${tempDir}share_${Date.now()}.${ext}`;

      const downloadRes = await FileSystem.downloadAsync(imageUrl, fileUri);
      if (downloadRes.status !== 200) {
        showToast('图片准备失败，请稍后重试');
        return false;
      }
      targetUri = downloadRes.uri;
    }

    await Sharing.shareAsync(targetUri, {
      dialogTitle: '分享图片',
      mimeType: 'image/*',
    });

    cleanupTempFile(targetUri, imageUrl);
    return true;
  } catch {
    console.error('分享图片失败');
    showToast('分享图片失败');
    return false;
  }
}

/**
 * 复制图片链接
 */
export async function copyImageUrl(imageUrl: string): Promise<boolean> {
  try {
    void impactAsync(ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(imageUrl);
    showToast('图片链接已复制到剪贴板');
    return true;
  } catch {
    console.error('复制图片链接失败');
    showToast('复制失败');
    return false;
  }
}

function cleanupTempFile(targetUri: string, originalUrl: string) {
  if (targetUri !== originalUrl && targetUri.startsWith('file://')) {
    FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => {});
  }
}
