import { act, fireEvent, render } from '@testing-library/react-native';
import RichContentFixturesScreen from '../src/app/dev/rich-content/index';
import StructuredContentScreen from '../src/app/dev/rich-content/structured';
import {
  mergeStructuredContentPages,
  structuredContentCases,
} from '../src/features/rich-content/dev/structuredCases';
import type { ZhihuStructuredContent } from '../src/types/zhihu';

interface StructuredProps {
  content: ZhihuStructuredContent;
  renderer: 'blocks' | 'native-v2';
  documentId: string;
  previewSegmentCount: number;
  onLinkPress?: (url: string) => void;
}

const mockStructuredRenderer = jest.fn<void, [StructuredProps]>();
const mockWriteSettings = jest.fn();
const mockPush = jest.fn();

jest.mock('react-native/Libraries/Image/Image', () => {
  const Image = Object.assign(() => null, {
    resolveAssetSource: (asset: { testUri: string }) => ({
      uri: `file://${asset.testUri}`,
      width: 192,
      height: 192,
      scale: 1,
    }),
  });
  return { __esModule: true, default: Image };
});
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, useThemeColor: () => '#345678' };
});
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/constants/Colors', () => ({
  __esModule: true,
  default: {
    light: {
      text: '#123456',
      textTertiary: '#789abc',
      tabIconDefault: '#789abc',
    },
  },
}));
jest.mock('../src/features/rich-content/dev/fixtures', () => ({
  getRichContentFixtureSummaries: () => [],
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    () => ({ setRichContentRenderer: mockWriteSettings }),
    {
      setState: mockWriteSettings,
      getState: () => ({ setRichContentRenderer: mockWriteSettings }),
    },
  ),
}));
jest.mock('../src/features/rich-content', () => {
  const React = jest.requireActual('react');
  const native = jest.requireActual('react-native');
  const parsing = jest.requireActual(
    '../src/features/rich-content/structuredContent',
  );
  return {
    parseStructuredContentPaging: parsing.parseStructuredContentPaging,
    ZhihuStructuredContent: (props: StructuredProps) => {
      mockStructuredRenderer(props);
      const [expanded, setExpanded] = React.useState(false);
      const visible = expanded
        ? props.content.segments
        : props.content.segments.slice(0, props.previewSegmentCount);
      return React.createElement(
        native.View,
        null,
        React.createElement(
          native.Text,
          { testID: 'structured-backend' },
          props.renderer,
        ),
        React.createElement(
          native.Text,
          { testID: 'structured-visible-segments' },
          visible.map((node) => node.id).join(','),
        ),
        React.createElement(
          native.Pressable,
          {
            accessibilityRole: 'button',
            accessibilityLabel: expanded ? '收起分段' : '展开全部分段',
            onPress: () => setExpanded(!expanded),
          },
          React.createElement(
            native.Text,
            null,
            expanded ? '收起分段' : '展开全部分段',
          ),
        ),
      );
    },
  };
});

beforeEach(() => jest.clearAllMocks());

test('the fixture list exposes the structured renderer comparison page', async () => {
  const host = await render(<RichContentFixturesScreen />);
  await fireEvent.press(host.getByText('structured_content 渲染对照'));
  expect(mockPush).toHaveBeenCalledWith('/dev/rich-content/structured');
  await host.unmount();
});

test('backend changes retain the same structured source and accessible segment controls without writing settings', async () => {
  const host = await render(<StructuredContentScreen />);
  await fireEvent.press(host.getByText('展开原始 JSON'));
  const originalJson = host.getByTestId('structured-raw-json').props.children;
  const originalContent = mockStructuredRenderer.mock.calls[0][0].content;
  expect(
    host.getByTestId('structured-visible-segments').props.children.split(','),
  ).toHaveLength(3);
  await fireEvent.press(host.getByLabelText('展开全部分段'));
  expect(
    host.getByTestId('structured-visible-segments').props.children.split(','),
  ).toHaveLength(6);
  await fireEvent.press(host.getByText('tiqian-super-mini 文本流'));
  expect(host.getByTestId('structured-backend').props.children).toBe(
    'native-v2',
  );
  expect(host.getByTestId('structured-raw-json').props.children).toBe(
    originalJson,
  );
  expect(
    mockStructuredRenderer.mock.calls[
      mockStructuredRenderer.mock.calls.length - 1
    ][0].content,
  ).toBe(originalContent);
  expect(host.getByLabelText('收起分段')).toBeTruthy();
  await fireEvent.press(host.getByLabelText('收起分段'));
  expect(
    host.getByTestId('structured-visible-segments').props.children.split(','),
  ).toHaveLength(3);
  expect(mockWriteSettings).not.toHaveBeenCalled();
  expect(JSON.parse(originalJson)).not.toHaveProperty('html');
  await host.unmount();
});

test('local continuation merges IDs, adopts the last paging state and resets source and JSON panel when selecting a case', async () => {
  const host = await render(<StructuredContentScreen />);
  await fireEvent.press(host.getByLabelText('案例 合成：本地续页边界'));
  await fireEvent.press(host.getByText('展开原始 JSON'));
  const first = JSON.parse(
    host.getByTestId('structured-raw-json').props.children,
  ) as ZhihuStructuredContent;
  expect(first.segments).toHaveLength(5);
  expect(JSON.parse(first.paging).is_end).toBe(false);
  await fireEvent.press(host.getByText('加载本地下一页'));
  const complete = JSON.parse(
    host.getByTestId('structured-raw-json').props.children,
  ) as ZhihuStructuredContent;
  expect(complete.segments).toHaveLength(7);
  expect(complete.segments.filter((node) => node.id === 'b-end')).toHaveLength(
    1,
  );
  expect(JSON.parse(complete.paging).is_end).toBe(true);
  expect(host.getByText('本地正文已完整')).toBeTruthy();
  expect(host.getByTestId('structured-paging-status').props.children).toContain(
    '第 2 / 2 页',
  );
  await fireEvent.press(host.getByLabelText('案例 E：段落与文字链接'));
  expect(host.queryByTestId('structured-raw-json')).toBeNull();
  expect(host.getByTestId('structured-paging-status').props.children).toContain(
    '第 1 / 1 页',
  );
  await fireEvent.press(host.getByLabelText('案例 合成：本地续页边界'));
  expect(host.getByText('加载本地下一页')).toBeTruthy();
  expect(host.getByTestId('structured-paging-status').props.children).toContain(
    '第 1 / 2 页',
  );
  await host.unmount();
});

test('navigation remains local while captured images retain public CDN URLs without bundled downloads', async () => {
  const host = await render(<StructuredContentScreen />);
  const props = mockStructuredRenderer.mock.calls[0][0];
  await act(() => props.onLinkPress?.('https://example.invalid/reading'));
  expect(
    host.getByText('选中的合成链接：https://example.invalid/reading'),
  ).toBeTruthy();
  for (const item of structuredContentCases) {
    if (item.source === 'capture-derived') expect(item.resources).toEqual({});
    for (const page of item.pages) {
      for (const node of page.segments) {
        if (node.type !== 'image') continue;
        for (const url of [...node.image.urls, ...node.image.original_urls]) {
          if (item.source === 'capture-derived') {
            expect(new URL(url).hostname).toMatch(/(?:^|\.)zhimg\.com$/);
          } else {
            expect(url).toMatch(/^https:\/\/example\.invalid\//);
            expect(item.resources[url]?.offlineUri).toBeTruthy();
          }
        }
      }
    }
  }
  await host.unmount();
});

test('the partial captured body remains explicitly incomplete without inventing a captured continuation', async () => {
  const host = await render(<StructuredContentScreen />);
  await fireEvent.press(host.getByLabelText('案例 B：标题与重叠标记'));
  expect(host.getByText('原样本正文未完（未捕获续页）')).toBeTruthy();
  expect(host.queryByText('加载本地下一页')).toBeNull();
  expect(host.getByTestId('structured-paging-status').props.children).toContain(
    '20 个分段 · is_end=false',
  );
  await fireEvent.press(host.getByText('展开原始 JSON'));
  const raw = JSON.parse(
    host.getByTestId('structured-raw-json').props.children,
  ) as ZhihuStructuredContent;
  expect(raw.segments).toHaveLength(20);
  expect(JSON.parse(raw.paging).is_end).toBe(false);
  await host.unmount();
});

test('local merging preserves the first ID order and never mutates bundled source pages', () => {
  const item = structuredContentCases.find(
    (value) => value.id === 'synthetic-pagination',
  );
  if (!item) throw new Error('缺少本地合成案例');
  const original = JSON.stringify(item.pages);
  const merged = mergeStructuredContentPages(item.pages);
  expect(merged.segments.map((node) => node.id)).toEqual([
    'b-heading',
    'b-overlap',
    'b-body',
    'b-heading-two',
    'b-end',
    'b-next',
    'b-final',
  ]);
  const updated = merged.segments.find((node) => node.id === 'b-end');
  expect(updated?.type === 'paragraph' ? updated.paragraph.text : '').toContain(
    '续页更新',
  );
  expect(merged.paging).toBe(item.pages[1].paging);
  expect(JSON.stringify(item.pages)).toBe(original);
});
