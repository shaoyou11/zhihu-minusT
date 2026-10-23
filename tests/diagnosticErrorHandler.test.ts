import { installDiagnosticErrorHandler } from '../src/utils/diagnosticErrorHandler';

test('records fatal errors synchronously before delegating without changing them', () => {
  const calls: string[] = [];
  const previous = jest.fn(() => calls.push('previous'));
  const setGlobalHandler = jest.fn();
  const record = jest.fn(() => calls.push('record'));
  expect(
    installDiagnosticErrorHandler(record, {
      getGlobalHandler: () => previous,
      setGlobalHandler,
    }),
  ).toBe(true);
  const error = new TypeError('synthetic-private-detail');
  setGlobalHandler.mock.calls[0][0](error, true);
  expect(calls).toEqual(['record', 'previous']);
  expect(record).toHaveBeenCalledWith(error);
  expect(previous).toHaveBeenCalledWith(error, true);
});

test('recording failure still delegates to the previous handler', () => {
  const previous = jest.fn();
  const setGlobalHandler = jest.fn();
  installDiagnosticErrorHandler(
    () => {
      throw new Error('storage unavailable');
    },
    { getGlobalHandler: () => previous, setGlobalHandler },
  );
  setGlobalHandler.mock.calls[0][0]('synthetic-error', false);
  expect(previous).toHaveBeenCalledWith('synthetic-error', false);
});

test('does not replace an absent platform handler', () => {
  const setGlobalHandler = jest.fn();
  expect(installDiagnosticErrorHandler(jest.fn(), { setGlobalHandler })).toBe(
    false,
  );
  expect(setGlobalHandler).not.toHaveBeenCalled();
});
