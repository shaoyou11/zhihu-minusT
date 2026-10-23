import { fireEvent, render } from '@testing-library/react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { Try } from 'expo-router/build/views/Try';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { DiagnosticScope } from '../src/components/DiagnosticScope';
import {
  getDiagnosticContext,
  rememberDiagnosticContext,
} from '../src/utils/diagnosticContext';

jest.mock('expo-router/build/views/Splash', () => ({ hideAsync: jest.fn() }));

let consoleError: jest.SpyInstance;

beforeEach(() => {
  // The renderer also prints exceptions that have been caught by the boundary.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => consoleError.mockRestore());

test('forwards the same annotated error to the app boundary and recovers on retry', async () => {
  const error = new TypeError("Cannot read property 'length' of undefined");
  const originalKeys = Reflect.ownKeys(error);
  const report = jest.fn();
  let fail = true;

  function Child() {
    if (fail) throw error;
    return <Text>Recovered</Text>;
  }

  function RootFallback({ error: caught, retry }: ErrorBoundaryProps) {
    useEffect(() => {
      report(caught, getDiagnosticContext(caught));
    }, [caught]);
    return (
      <Pressable onPress={retry}>
        <Text>Retry</Text>
      </Pressable>
    );
  }

  const host = await render(
    <Try catch={RootFallback}>
      <DiagnosticScope context={{ area: 'following', operation: 'render' }}>
        <DiagnosticScope
          context={{ area: 'following.recent-moments', operation: 'render' }}
        >
          <Child />
        </DiagnosticScope>
      </DiagnosticScope>
    </Try>,
  );

  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(error, {
    area: 'following.recent-moments',
    operation: 'render',
  });
  expect(Reflect.ownKeys(error)).toEqual(originalKeys);

  fail = false;
  await fireEvent.press(host.getByText('Retry'));

  expect(host.getByText('Recovered')).toBeTruthy();
  expect(report).toHaveBeenCalledTimes(1);
});

test('retains the first context without associating independent errors or primitives', () => {
  const error = Object.freeze(new Error('synthetic'));
  rememberDiagnosticContext(error, {
    area: 'following.recent-moments',
    operation: 'render',
  });
  rememberDiagnosticContext(error, {
    area: 'application',
    operation: 'render',
  });

  expect(getDiagnosticContext(error)).toEqual({
    area: 'following.recent-moments',
    operation: 'render',
  });
  expect(getDiagnosticContext(new Error('synthetic'))).toBeUndefined();
  for (const value of [undefined, null, false, 0, 'synthetic']) {
    expect(() =>
      rememberDiagnosticContext(value, { area: 'application' }),
    ).not.toThrow();
    expect(getDiagnosticContext(value)).toBeUndefined();
  }
});
