import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { type Href, Stack, useRouter } from 'expo-router';
import type React from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  View as RNView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { MarkdownText } from '@/components/MarkdownText';
import { AppDialog } from '@/components/overlays/AppDialog';
import { Text, useThemeColor } from '@/components/Themed';
import { getUpdateInfo, type UpdateInfo } from '@/components/UpdateChecker';

const REPOSITORY_URL = 'https://github.com/shaoyou11/zhihu-minusT';

interface AboutLinkProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  value?: string;
}

function AboutLink({ icon, label, onPress, value }: AboutLinkProps) {
  const primaryColor = useThemeColor({}, 'primary');
  const controlBackground = useThemeColor({}, 'controlBackground');
  const mutedColor = useThemeColor({}, 'textSecondary');

  return (
    <BouncyButton onPress={onPress} style={styles.linkRow}>
      <RNView style={[styles.linkIcon, { backgroundColor: controlBackground }]}>
        <Ionicons name={icon} size={18} color={primaryColor} />
      </RNView>
      <Text style={styles.linkLabel}>{label}</Text>
      {value ? (
        <Text type="secondary" style={styles.linkValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={17} color={mutedColor} />
    </BouncyButton>
  );
}

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const canvasColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'backgroundSecondary');
  const borderColor = useThemeColor({}, 'controlBorder');
  const onPrimary = useThemeColor({}, 'onPrimary');
  const primaryColor = useThemeColor({}, 'primary');
  const currentVersion =
    Constants.expoConfig?.version || Constants.nativeAppVersion || '未知';

  const checkUpdate = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const info = await getUpdateInfo();
      if (info.updateAvailable) {
        setUpdateInfo(info);
      } else {
        Alert.alert('已是最新版', `当前版本 v${info.currentVersion}`);
      }
    } catch {
      Alert.alert('检查失败', '暂时无法连接 GitHub Releases，请稍后再试。');
    } finally {
      setChecking(false);
    }
  };

  return (
    <RNView style={[styles.container, { backgroundColor: canvasColor }]}>
      <Stack.Screen options={{ title: '关于', headerShadowVisible: false }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <RNView style={styles.hero}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logo}
            accessibilityLabel="知乎 minusT 应用图标"
          />
          <Text style={styles.appName}>知乎 minusT</Text>
          <Text type="secondary" style={styles.tagline}>
            一款轻量、纯净、专注阅读的第三方知乎客户端
          </Text>
          <RNView
            style={[
              styles.versionPill,
              { backgroundColor: `${primaryColor}18` },
            ]}
          >
            <Text style={[styles.versionText, { color: primaryColor }]}>
              Version {currentVersion}
            </Text>
          </RNView>
        </RNView>

        <RNView
          style={[
            styles.updateCard,
            { backgroundColor: cardColor, borderColor },
          ]}
        >
          <RNView style={styles.updateCopy}>
            <Text style={styles.updateTitle}>保持应用最新</Text>
            <Text type="secondary" style={styles.updateDescription}>
              从 GitHub Releases 获取最新版本信息
            </Text>
          </RNView>
          <BouncyButton
            onPress={() => void checkUpdate()}
            disabled={checking}
            style={[styles.updateButton, { backgroundColor: primaryColor }]}
          >
            {checking ? (
              <ActivityIndicator size="small" color={onPrimary} />
            ) : (
              <Text style={[styles.updateButtonText, { color: onPrimary }]}>
                检查更新
              </Text>
            )}
          </BouncyButton>
        </RNView>

        <RNView style={[styles.linkCard, { backgroundColor: cardColor }]}>
          <AboutLink
            icon="time-outline"
            label="版本记录"
            value="全部 Release"
            onPress={() => router.push('/releases' as Href)}
          />
        </RNView>

        <RNView style={styles.feedbackIntro}>
          <Text style={styles.feedbackTitle}>反馈与项目</Text>
          <Text type="secondary" style={styles.feedbackDescription}>
            遇到问题或有新的想法，欢迎提交 GitHub
            Issue，也可以先查看已有问题是否有相同反馈。
          </Text>
        </RNView>

        <RNView style={[styles.linkCard, { backgroundColor: cardColor }]}>
          <AboutLink
            icon="logo-github"
            label="开源项目"
            value="GitHub"
            onPress={() => void Linking.openURL(REPOSITORY_URL)}
          />
          <RNView style={[styles.divider, { backgroundColor: borderColor }]} />
          <AboutLink
            icon="chatbubble-ellipses-outline"
            label="提交反馈"
            value="GitHub Issue"
            onPress={() => void Linking.openURL(`${REPOSITORY_URL}/issues/new`)}
          />
          <RNView style={[styles.divider, { backgroundColor: borderColor }]} />
          <AboutLink
            icon="document-text-outline"
            label="开源许可"
            value="GPL-3.0"
            onPress={() =>
              void Linking.openURL(`${REPOSITORY_URL}/blob/main/LICENSE`)
            }
          />
        </RNView>

        <Text type="secondary" style={styles.footer}>
          回归阅读本质，少一点打扰，多一点内容。
        </Text>
      </ScrollView>
      {updateInfo ? (
        <AppDialog
          visible
          title={`发现新版本 ${updateInfo.latestVersionTag}`}
          icon="cloud-download-outline"
          message={`当前版本 v${updateInfo.currentVersion}`}
          onClose={() => setUpdateInfo(null)}
          actions={[
            {
              label: '稍后',
              onPress: () => setUpdateInfo(null),
              variant: 'secondary',
            },
            {
              label: '查看更新',
              onPress: () => {
                setUpdateInfo(null);
                void Linking.openURL(updateInfo.releaseUrl);
              },
              variant: 'primary',
            },
          ]}
        >
          <ScrollView
            nestedScrollEnabled
            style={styles.updateNotes}
            contentContainerStyle={styles.updateNotesContent}
          >
            <MarkdownText markdown={updateInfo.releaseNotes} />
          </ScrollView>
        </AppDialog>
      ) : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  hero: { alignItems: 'center', paddingTop: 24, paddingBottom: 32 },
  logo: { width: 112, height: 112, borderRadius: 26 },
  appName: { fontSize: 28, fontWeight: '800', marginTop: 18 },
  tagline: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 300,
  },
  versionPill: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  versionText: { fontSize: 12, fontWeight: '700' },
  updateCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  updateCopy: { flex: 1, marginRight: 12 },
  updateTitle: { fontSize: 16, fontWeight: '700' },
  updateDescription: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  updateButton: {
    minWidth: 90,
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateButtonText: { fontSize: 13, fontWeight: '700' },
  updateNotes: { width: '100%', maxHeight: 300, marginTop: 16 },
  updateNotesContent: { paddingBottom: 2 },
  feedbackIntro: { paddingHorizontal: 4, marginTop: 28, marginBottom: 12 },
  feedbackTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  feedbackDescription: { fontSize: 13, lineHeight: 20 },
  linkCard: { borderRadius: 16, overflow: 'hidden' },
  linkRow: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkLabel: { flex: 1, fontSize: 15, fontWeight: '600', marginLeft: 12 },
  linkValue: { maxWidth: 112, fontSize: 12, marginRight: 8 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 24 },
});
