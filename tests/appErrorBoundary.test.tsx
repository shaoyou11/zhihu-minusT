import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Try } from 'expo-router/build/views/Try';
import { StrictMode } from 'react';
import { Text } from 'react-native';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { formatDiagnosticLogsForExport } from '../src/utils/diagnosticLogs';
import { captureTelemetryException } from '../src/utils/telemetry';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-router/build/views/Splash', () => ({ hideAsync: jest.fn() }));
jest.mock('../src/utils/telemetry', () => ({
  captureTelemetryException: jest.fn(),
}));
jest.mock('../src/utils/diagnosticLogs', () => ({
  formatDiagnosticLogsForExport: jest.fn(),
}));

const syntheticError = new TypeError('synthetic secret must not be displayed');
let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  // React reports caught synthetic exceptions to the test console as well.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  jest
    .mocked(formatDiagnosticLogsForExport)
    .mockReturnValue('synthetic sanitized diagnostic report');
});

afterEach(() => consoleError.mockRestore());

test('the router boundary reports a render error and retries the complete child tree', async () => {
  let shouldThrow = true;
  function RootWithChild() {
    if (shouldThrow) throw syntheticError;
    return <Text>恢复后的页面</Text>;
  }

  const host = await render(
    <Try catch={AppErrorBoundary}>
      <RootWithChild />
    </Try>,
  );

  expect(host.getByText('页面出现异常')).toBeTruthy();
  expect(host.queryByText(syntheticError.message)).toBeNull();
  expect(captureTelemetryException).toHaveBeenCalledTimes(1);
  expect(captureTelemetryException).toHaveBeenCalledWith(
    syntheticError,
    'react-render',
  );

  shouldThrow = false;
  await fireEvent.press(host.getByRole('button', { name: '重试页面' }));

  expect(host.getByText('恢复后的页面')).toBeTruthy();
  expect(host.queryByText('页面出现异常')).toBeNull();
  expect(captureTelemetryException).toHaveBeenCalledTimes(1);
});

test('replayed effects and rerenders do not duplicate the same error report', async () => {
  const retry = jest.fn().mockResolvedValue(undefined);
  const host = await render(
    <StrictMode>
      <AppErrorBoundary error={syntheticError} retry={retry} />
    </StrictMode>,
  );
  await host.rerender(
    <StrictMode>
      <AppErrorBoundary error={syntheticError} retry={retry} />
    </StrictMode>,
  );

  expect(captureTelemetryException).toHaveBeenCalledTimes(1);
});

test('copies only the formatted diagnostic report without requiring app providers', async () => {
  const host = await render(
    <AppErrorBoundary error={syntheticError} retry={async () => {}} />,
  );

  await fireEvent.press(host.getByRole('button', { name: '复制报错日志' }));

  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
    'synthetic sanitized diagnostic report',
  );
  await waitFor(() =>
    expect(host.getByText('已复制脱敏报错日志。')).toBeTruthy(),
  );
});

test.each(['false', 'rejection'])(
  'shows a safe inline failure when copying returns %s',
  async (failure) => {
    if (failure === 'false') {
      jest.mocked(Clipboard.setStringAsync).mockResolvedValue(false);
    } else {
      jest.mocked(Clipboard.setStringAsync).mockRejectedValue(syntheticError);
    }
    const host = await render(
      <AppErrorBoundary error={syntheticError} retry={async () => {}} />,
    );

    await fireEvent.press(host.getByRole('button', { name: '复制报错日志' }));

    await waitFor(() =>
      expect(host.getByText('复制失败，请重试。')).toBeTruthy(),
    );
    expect(host.queryByText(syntheticError.message)).toBeNull();
    expect(host.getByRole('button', { name: '复制报错日志' })).toBeEnabled();
  },
);

test('reporting and retry failures leave recovery controls available', async () => {
  jest.mocked(captureTelemetryException).mockImplementation(() => {
    throw syntheticError;
  });
  const retry = jest.fn().mockRejectedValue(syntheticError);
  const host = await render(
    <AppErrorBoundary error={syntheticError} retry={retry} />,
  );

  await fireEvent.press(host.getByRole('button', { name: '重试页面' }));

  await waitFor(() =>
    expect(
      host.getByText('重试未成功，可以复制报错日志后重新打开应用。'),
    ).toBeTruthy(),
  );
  expect(host.getByRole('button', { name: '复制报错日志' })).toBeEnabled();
  expect(host.getByRole('button', { name: '重试页面' })).toBeEnabled();
  expect(host.queryByText(syntheticError.message)).toBeNull();
});
