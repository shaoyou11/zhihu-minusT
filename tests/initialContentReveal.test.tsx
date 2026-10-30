import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Platform, Text } from 'react-native';
import { InitialContentReveal } from '../src/components/InitialContentReveal';

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

test('reveals content only on its first completed load and leaves later updates readable', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const host = await render(
    <InitialContentReveal ready={false}>
      <Text>加载中</Text>
    </InitialContentReveal>,
  );
  await act(async () => {});
  expect(host.getByText('加载中')).toBeVisible();
  await host.rerender(
    <InitialContentReveal ready>
      <Text>正文</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('正文')).toBeTruthy();
  expect(timing).toHaveBeenCalledTimes(1);
  await host.rerender(
    <InitialContentReveal ready={false}>
      <Text>重新排版</Text>
    </InitialContentReveal>,
  );
  await host.rerender(
    <InitialContentReveal ready>
      <Text>更新后的正文</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('更新后的正文')).toBeVisible();
  expect(timing).toHaveBeenCalledTimes(1);
});

test('reduced motion shows the content without starting a fade', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  const timing = jest.spyOn(Animated, 'timing');
  const host = await render(
    <InitialContentReveal ready={false}>
      <Text>加载中</Text>
    </InitialContentReveal>,
  );
  await act(async () => {});
  await host.rerender(
    <InitialContentReveal ready>
      <Text>正文</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('正文')).toBeVisible();
  expect(timing).not.toHaveBeenCalled();
});
