'use dom';

import katex from 'katex';
import { colors, typography } from '@/constants/designTokens';
import katexStyle from '@/features/rich-content/assets/katex-style.json';

interface MathViewProps {
  formula: string;
  displayMode?: boolean;
  colorScheme?: 'light' | 'dark';
  textColor?: string;
}

export default function MathView({
  formula,
  displayMode = false,
  colorScheme = 'light',
  textColor: resolvedTextColor,
}: MathViewProps) {
  const html = katex.renderToString(formula, {
    displayMode: displayMode,
    throwOnError: false,
    strict: false,
  });

  const textColor = resolvedTextColor ?? colors[colorScheme].text;

  return (
    <span
      style={{
        display: displayMode ? 'block' : 'inline-block',
        textAlign: displayMode ? 'center' : 'left',
        backgroundColor: 'transparent',
      }}
    >
      <style>{katexStyle.css}</style>
      <style>{`
        body {
          margin: 0;
          padding: 0;
          background-color: transparent !important;
        }
      `}</style>
      <span
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX 的渲染结果只能这样注入。formula 虽来自知乎正文,但 renderToString 的 trust 选项默认为 false,\href/\url/\includegraphics 等可注入 URL 或 HTML 的命令会被拒绝渲染,输出不含可执行内容。
        dangerouslySetInnerHTML={{ __html: html }}
        style={{
          fontSize: `${typography.fontSize.subtitle}px`,
          color: textColor,
        }}
      />
    </span>
  );
}
