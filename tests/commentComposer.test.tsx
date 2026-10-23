import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { createRef } from 'react';
import { Alert, type TextInputInstance } from 'react-native';
import { type UploadedImage, uploadImage } from '../src/api/zhihu/image';
import {
  CommentComposer,
  type CommentDraft,
} from '../src/components/CommentComposer';

jest.mock('../src/api/zhihu/image', () => ({ uploadImage: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').View,
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View };
});
jest.mock('../src/constants/Colors', () => ({
  __esModule: true,
  default: {
    light: { textSecondary: '#666', textTertiary: '#777', danger: '#f00' },
  },
}));
jest.mock('../src/utils/zhihuError', () => ({
  getZhihuErrorMessage: () => '上传失败',
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function setup(
  onSubmit = jest
    .fn<Promise<void>, [CommentDraft]>()
    .mockResolvedValue(undefined),
) {
  const onChangeText = jest.fn();
  const host = await render(
    <CommentComposer
      colorScheme="light"
      borderColor="#ddd"
      inputRef={createRef<TextInputInstance>()}
      inputText="合成草稿"
      isSubmitting={false}
      onChangeText={onChangeText}
      onSubmit={onSubmit}
      onCancelReply={jest.fn()}
      placeholder="评论输入"
      textColor="#111"
      tintColor="#00f"
    />,
  );
  return { host, onSubmit, onChangeText };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({
      granted: true,
    } as ImagePicker.MediaLibraryPermissionResponse);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///synthetic.png', width: 40, height: 30 }],
  });
});

test('submission is locked before parent mutation state propagates and failed drafts remain editable', async () => {
  const sending = deferred<void>();
  const onSubmit = jest
    .fn<Promise<void>, [CommentDraft]>()
    .mockReturnValue(sending.promise);
  const { host, onChangeText } = await setup(onSubmit);
  const button = host.getByLabelText('发布评论');
  let first: Promise<void> | undefined;
  await act(() => {
    first = button?.props.onPress();
    void button?.props.onPress();
  });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(host.getByPlaceholderText('评论输入').props.editable).toBe(false);
  await act(async () => {
    sending.reject(new Error('synthetic failure'));
    await first;
  });
  expect(onChangeText).not.toHaveBeenCalled();
  expect(host.getByPlaceholderText('评论输入').props.editable).toBe(true);
  await host.unmount();
});

test('removing and reselecting the same image cancels the old upload and ignores its late result', async () => {
  const first = deferred<UploadedImage>();
  const second = deferred<UploadedImage>();
  jest
    .mocked(uploadImage)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { host, onSubmit } = await setup();
  await fireEvent.press(host.getByLabelText('添加图片'));
  await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
  const firstSignal = jest.mocked(uploadImage).mock.calls[0][2]?.signal;
  await fireEvent.press(host.getByLabelText('移除图片'));
  expect(firstSignal?.aborted).toBe(true);
  await fireEvent.press(host.getByLabelText('添加图片'));
  await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(2));
  await act(() =>
    first.resolve({
      imageId: 'old',
      src: 'https://example.com/old',
      width: 40,
      height: 30,
    }),
  );
  expect(host.getByText('正在上传 1 张图片...')).toBeTruthy();
  const current = {
    imageId: 'new',
    src: 'https://example.com/new',
    width: 40,
    height: 30,
  };
  await act(() => second.resolve(current));
  await fireEvent.press(host.getByText('发布'));
  expect(onSubmit).toHaveBeenCalledWith({
    text: '合成草稿',
    images: [current],
  });
  await host.unmount();
});

test('leaving the composer aborts uploads without showing stale failure alerts', async () => {
  const upload = deferred<UploadedImage>();
  jest.mocked(uploadImage).mockReturnValue(upload.promise);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const { host } = await setup();
  await fireEvent.press(host.getByLabelText('添加图片'));
  await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
  const signal = jest.mocked(uploadImage).mock.calls[0][2]?.signal;
  await host.unmount();
  expect(signal?.aborted).toBe(true);
  await act(() => upload.reject(new Error('late synthetic failure')));
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
});
