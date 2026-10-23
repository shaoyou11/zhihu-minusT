import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  type ImageSourcePropType,
  Platform,
  View as RNView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor } from '@/components/Themed';
import { APP_ICON_OPTIONS } from '@/constants/appIcons';
import {
  type AppIconName,
  getAppIcon,
  isAppIconSupported,
  setAppIcon,
} from '@/modules/zhihu-app-icon';

function AppIconPreview({
  source,
  size = 72,
}: {
  source: ImageSourcePropType;
  size?: number;
}) {
  const scale = size / 192;
  return (
    <Image
      source={source}
      style={[
        styles.iconPreview,
        {
          width: size,
          height: size,
          borderRadius: 42 * scale,
        },
      ]}
    />
  );
}

export default function AppIconSettings() {
  const insets = useSafeAreaInsets();
  const canvasColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'backgroundSecondary');
  const borderColor = useThemeColor({}, 'controlBorder');
  const primaryColor = useThemeColor({}, 'primary');
  const mutedColor = useThemeColor({}, 'textSecondary');
  const [selectedIcon, setSelectedIcon] = useState<AppIconName>('default');
  const [changingIcon, setChangingIcon] = useState<AppIconName | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([isAppIconSupported(), getAppIcon()])
      .then(([isSupported, currentIcon]) => {
        if (!mounted) return;
        setSupported(isSupported);
        setSelectedIcon(currentIcon);
      })
      .catch(() => {
        if (mounted) setSupported(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectIcon = async (iconName: AppIconName) => {
    if (changingIcon || iconName === selectedIcon) return;
    setChangingIcon(iconName);
    try {
      const appliedIcon = await setAppIcon(iconName);
      setSelectedIcon(appliedIcon);
    } catch (error) {
      const message = error instanceof Error ? error.message : '请稍后重试。';
      Alert.alert('无法更换图标', message);
    } finally {
      setChangingIcon(null);
    }
  };

  return (
    <RNView style={[styles.container, { backgroundColor: canvasColor }]}>
      <Stack.Screen
        options={{ title: 'App 图标', headerShadowVisible: false }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <Text type="secondary" style={styles.intro}>
          选择显示在主屏幕上的图标。图标配色与应用内的主题色独立。
        </Text>

        {supported === null ? (
          <RNView style={styles.loadingContainer}>
            <ActivityIndicator color={primaryColor} />
          </RNView>
        ) : supported ? (
          <RNView style={styles.iconGrid}>
            {APP_ICON_OPTIONS.map((option) => {
              const isSelected = selectedIcon === option.id;
              const isChanging = changingIcon === option.id;
              return (
                <BouncyButton
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label} App 图标`}
                  accessibilityState={{
                    selected: isSelected,
                    disabled: changingIcon !== null,
                  }}
                  disabled={changingIcon !== null}
                  onPress={() => void selectIcon(option.id)}
                  style={[
                    styles.iconOption,
                    {
                      backgroundColor: cardColor,
                      borderColor: isSelected ? primaryColor : borderColor,
                    },
                    isSelected && styles.selectedOption,
                  ]}
                >
                  <AppIconPreview source={option.source} />
                  <RNView style={styles.optionFooter}>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    {isChanging ? (
                      <ActivityIndicator size="small" color={primaryColor} />
                    ) : isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={primaryColor}
                      />
                    ) : null}
                  </RNView>
                </BouncyButton>
              );
            })}
          </RNView>
        ) : (
          <RNView
            style={[styles.unavailableCard, { backgroundColor: cardColor }]}
          >
            <Ionicons name="apps-outline" size={28} color={mutedColor} />
            <Text style={styles.unavailableTitle}>当前版本不支持切换</Text>
            <Text type="secondary" style={styles.unavailableDescription}>
              请安装包含新原生功能的开发或正式版本；Expo Go
              和旧安装包无法测试此功能。
            </Text>
          </RNView>
        )}

        {supported && Platform.OS === 'ios' ? (
          <Text type="secondary" style={styles.note}>
            iOS 会在每次更换时显示系统确认提示。
          </Text>
        ) : null}
        {supported && Platform.OS === 'android' ? (
          <Text type="secondary" style={styles.note}>
            部分 Android 启动器会缓存图标，更换后可能需要数秒才会刷新。
          </Text>
        ) : null}
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  intro: {
    fontSize: 13,
    lineHeight: 20,
    marginHorizontal: 4,
    marginBottom: 18,
  },
  loadingContainer: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  iconOption: {
    width: '48%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  selectedOption: { borderWidth: 1.5 },
  iconPreview: {
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  optionFooter: {
    width: '100%',
    minHeight: 22,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  unavailableCard: {
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: 'center',
  },
  unavailableTitle: { marginTop: 12, fontSize: 16, fontWeight: '600' },
  unavailableDescription: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  note: { fontSize: 12, lineHeight: 18, marginHorizontal: 4, marginTop: 14 },
});
