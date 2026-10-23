import * as Clipboard from 'expo-clipboard';
import { Alert, Share } from 'react-native';
import {
  consumeAppClipboardText,
  copyToClipboard,
} from '../src/utils/clipboard';
import { showToast } from '../src/utils/toast';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));

const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const share = jest.spyOn(Share, 'share');

beforeEach(() => {
  jest.clearAllMocks();
  consumeAppClipboardText('');
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  share.mockResolvedValue({
    action: Share.sharedAction,
    activityType: undefined,
  });
});

test('marks only successfully copied text and consumes its marker once', async () => {
  await expect(copyToClipboard('合成复制内容')).resolves.toBe(true);
  expect(consumeAppClipboardText('合成复制内容')).toBe(true);
  expect(consumeAppClipboardText('合成复制内容')).toBe(false);
  expect(alert).not.toHaveBeenCalled();
});

test('does not report a false clipboard result as success or suppress its next prompt', async () => {
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(false);
  await expect(copyToClipboard('合成复制内容')).resolves.toBe(false);
  expect(consumeAppClipboardText('合成复制内容')).toBe(false);
  expect(showToast).toHaveBeenCalledWith('复制失败');
  expect(alert).toHaveBeenCalledWith(
    '复制失败',
    expect.any(String),
    expect.arrayContaining([expect.objectContaining({ text: '系统分享' })]),
  );
});

test('a failed copy clears an earlier success marker', async () => {
  await copyToClipboard('第一条合成内容');
  jest
    .mocked(Clipboard.setStringAsync)
    .mockRejectedValueOnce(new Error('synthetic clipboard failure'));
  await copyToClipboard('第二条合成内容');
  expect(consumeAppClipboardText('第一条合成内容')).toBe(false);
});

test('the fallback shares the intended text and handles native failures', async () => {
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(false);
  await copyToClipboard('合成分享内容');
  const fallback = alert.mock.calls
    .at(-1)?.[2]
    ?.find((button) => button.text === '系统分享');
  expect(fallback?.onPress).toBeDefined();
  await fallback?.onPress?.();
  expect(share).toHaveBeenLastCalledWith({ message: '合成分享内容' });
  share.mockRejectedValueOnce(new Error('synthetic fallback failure'));
  await expect(fallback?.onPress?.()).resolves.toBeUndefined();
  expect(showToast).toHaveBeenLastCalledWith('分享失败，请稍后重试');
});
