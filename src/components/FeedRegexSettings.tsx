import { useEffect, useMemo, useState } from 'react';
import { View as RNView, StyleSheet, TextInput } from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { Section } from '@/components/SettingItem';
import { Text, useThemeColor } from '@/components/Themed';
import {
  FEED_REGEX_LIMITS,
  normalizeFeedRegexPatterns,
  parseFeedRegexInput,
} from '@/utils/feedRegex';

interface FeedRegexSettingsProps {
  patterns: string[];
  onChange: (patterns: string[]) => void;
  colorScheme: 'light' | 'dark';
}

export function FeedRegexSettings({
  patterns,
  onChange,
  colorScheme,
}: FeedRegexSettingsProps) {
  const savedPatterns = useMemo(
    () => normalizeFeedRegexPatterns(patterns),
    [patterns],
  );
  const savedInput = savedPatterns.join('\n');
  const [input, setInput] = useState(savedInput);
  const parsed = useMemo(() => parseFeedRegexInput(input), [input]);
  const textColor = useThemeColor({}, 'text');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const controlBackground = useThemeColor({}, 'controlBackground');
  const borderColor = useThemeColor({}, 'controlBorder');
  const primaryColor = useThemeColor({}, 'primary');
  const onPrimaryColor = useThemeColor({}, 'onPrimary');
  const dangerColor = useThemeColor({}, 'danger');
  const savedCount = savedPatterns.length;
  const hasErrors = parsed.invalidLines.length > 0;

  useEffect(() => {
    setInput(savedInput);
  }, [savedInput]);

  const save = () => {
    if (hasErrors) return;
    onChange(parsed.patterns);
    setInput(parsed.patterns.join('\n'));
  };

  return (
    <Section title="自定义正则屏蔽" colorScheme={colorScheme}>
      <RNView style={styles.content}>
        <Text type="secondary" style={styles.helper}>
          每行填写一个正则表达式，只写表达式本身，不加 /
          分隔符。任意一条匹配即屏蔽。
        </Text>
        <Text type="secondary" style={styles.helper}>
          使用 RE2 语法，不支持前后查找或反向引用。最多{' '}
          {FEED_REGEX_LIMITS.patterns} 条，每条最多{' '}
          {FEED_REGEX_LIMITS.patternLength} 个字符。
        </Text>
        <Text type="secondary" style={styles.helper}>
          仅匹配推荐流返回的完整正文纯文本，不含标题或 HTML
          标签，摘要、截断正文不参与。按 Unicode 字符匹配，“.”
          包含换行，换行计入长度。
        </Text>
        <Text type="secondary" style={styles.helper}>
          正文长度超过 {FEED_REGEX_LIMITS.textLength.toLocaleString('en-US')}{' '}
          时跳过，一个汉字通常计 1，常见 emoji 计 2。
        </Text>
        <Text type="secondary" style={styles.helper}>
          {'例如 ^.{0,50}$ 屏蔽正文不超过 50 个字符的内容。清空后保存可停用。'}
        </Text>
        <TextInput
          accessibilityLabel="自定义正则屏蔽规则"
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textAlignVertical="top"
          value={input}
          onChangeText={setInput}
          placeholder="每行一个正则表达式"
          placeholderTextColor={secondaryColor}
          style={[
            styles.input,
            {
              color: textColor,
              backgroundColor: controlBackground,
              borderColor: hasErrors ? dangerColor : borderColor,
            },
          ]}
        />
        {hasErrors ? (
          <Text accessibilityRole="alert" type="danger" style={styles.helper}>
            第 {parsed.invalidLines.join('、')}{' '}
            行：规则语法无效、不受支持或超出限制，请检查后再保存。
          </Text>
        ) : (
          <Text type="secondary" style={styles.helper}>
            {parsed.patterns.length > 0
              ? `${parsed.patterns.length} 条规则语法有效，保存后生效`
              : '没有规则，保存后将停用自定义正则屏蔽'}
          </Text>
        )}
        <RNView style={styles.footer}>
          <Text type="secondary" style={styles.savedStatus}>
            {savedCount > 0
              ? `已保存 ${savedCount} 条规则`
              : '尚未设置规则，当前未启用'}
          </Text>
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel="保存正则屏蔽规则"
            onPress={save}
            style={[styles.saveButton, { backgroundColor: primaryColor }]}
          >
            <Text style={[styles.saveText, { color: onPrimaryColor }]}>
              保存
            </Text>
          </BouncyButton>
        </RNView>
      </RNView>
    </Section>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  helper: { fontSize: 13, lineHeight: 20 },
  input: {
    minHeight: 132,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 14,
    lineHeight: 21,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savedStatus: { flex: 1, fontSize: 13 },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveText: { fontSize: 14, fontWeight: '600' },
});
