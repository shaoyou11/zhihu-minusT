import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ComponentProps } from 'react';
import { reactAnswerSegment } from '@/api/zhihu/answer';
import type { ActionSheetOption } from '@/components/overlays/ActionSheet';
import type { ZhihuSegmentInfo } from '@/types/zhihu';
import { ZhihuContent } from '../components/ZhihuContent';
import type { ZhihuNativeContent } from '../components/ZhihuNativeContent';
import { walkZhihuDocument } from '../documentTraversal';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';

let mockNativeProps: ComponentProps<typeof ZhihuNativeContent>;
let mockOptions: ActionSheetOption[] = [];
const mockPush = jest.fn();

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('../../../api/zhihu/answer', () => ({
  getAnswer: jest.fn(),
  createSegmentReaction: jest.fn(),
  reactAnswerSegment: jest.fn(async () => ({})),
  unreactAnswerSegment: jest.fn(async () => ({})),
}));
jest.mock('../../../api/zhihu/article', () => ({ getArticle: jest.fn() }));
jest.mock('../../../api/zhihu/pin', () => ({ getPin: jest.fn() }));
jest.mock('../../../api/zhihu/question', () => ({ getQuestion: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../components/ImageActionBottomSheet', () => ({
  ImageActionBottomSheet: () => null,
}));
jest.mock('../../../components/ImagePreviewModal', () => ({
  ImagePreviewModal: () => null,
}));
jest.mock('../../../components/BouncyButton', () => ({
  BouncyButton: () => null,
}));
jest.mock('../../../components/overlays/ActionSheet', () => ({
  ActionSheet: ({
    visible,
    options,
  }: {
    visible: boolean;
    options: ActionSheetOption[];
  }) => {
    if (visible) mockOptions = options;
    return null;
  },
}));
jest.mock('../../../components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useRuntimeThemeColors: () => ({ onPrimary: '#fff' }),
    useThemeColor: () => '#222',
  };
});
jest.mock('../../../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../../../store/useSettingsStore', () => ({
  useSettingsStore: () => ({
    richContentRenderer: 'native-v2',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  }),
}));
jest.mock('../components/ZhihuDOMContent', () => () => null);
jest.mock('../components/ZhihuNativeContent', () => ({
  isRichTextNativeAvailable: () => true,
  ZhihuNativeContent: (props: ComponentProps<typeof ZhihuNativeContent>) => {
    mockNativeProps = props;
    return null;
  },
}));

const sourceHtml =
  '<p data-pid="p-one">甲<span class="highlight-wrap">乙😀</span>丙</p>';
const segment: ZhihuSegmentInfo = {
  pid: 'p-one',
  text: '甲乙😀丙',
  marks: [
    {
      start_index: 1,
      end_index: 4,
      seg_info: {
        seg_ids: ['200'],
        is_like: false,
        like_count: 8,
        comment_count: 2,
      },
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOptions = [];
});

it('offers working copy, reaction and comments actions for a visual highlight with exact API metadata', async () => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
  });
  await render(
    <QueryClientProvider client={client}>
      <ZhihuContent
        content={sourceHtml}
        segmentInfos={[segment]}
        objectId="42"
        type="answer"
      />
    </QueryClientProvider>,
  );
  const document = normalizeZhihuDocument(sourceHtml, {
    documentId: 'answer:42',
    segmentInfos: [segment],
  }).document;
  const run = [...walkZhihuDocument(document)].find(
    (node) => node.type === 'segmentHighlight',
  );
  if (run?.type !== 'segmentHighlight') throw new Error('Missing highlight');
  await act(() => {
    mockNativeProps.onSegmentPress?.(
      {
        nodeId: run.id,
        paragraphId: 'p-one',
        start: 1,
        end: 4,
        text: '乙😀',
        segment: run,
      },
      document,
    );
  });
  expect(mockOptions.map((option) => option.key)).toEqual([
    'like',
    'comments',
    'copy',
    'discussion',
  ]);
  const copy = mockOptions.find((option) => option.key === 'copy');
  const comments = mockOptions.find((option) => option.key === 'comments');
  const like = mockOptions.find((option) => option.key === 'like');
  if (!copy || !comments || !like) throw new Error('Missing segment actions');
  expect(like.disabled).toBe(false);
  expect(comments.disabled).toBe(false);
  await act(async () => {
    await copy.onPress();
  });
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('乙😀');
  await act(() => {
    comments.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith(
    '/comments/42?type=answer&segmentId=200&pid=p-one&startOffset=1&endOffset=4&text=%E4%B9%99%F0%9F%98%80',
  );
  await act(() => {
    like.onPress();
  });
  await waitFor(() => {
    expect(reactAnswerSegment).toHaveBeenCalledWith(
      '42',
      ['200'],
      '乙😀',
      'p-one',
      1,
      4,
    );
  });
  client.clear();
});
