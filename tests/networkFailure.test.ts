import assert from 'node:assert/strict';
import {
  classifyNetworkError,
  classifyNetworkFailure,
} from '../src/utils/networkFailure';

test('classifies cancellation and timeout before native messages', () => {
  assert.equal(
    classifyNetworkFailure({ canceled: true, nativeMessage: 'SSL failure' }),
    'canceled',
  );
  assert.equal(
    classifyNetworkFailure({
      code: 'ETIMEDOUT',
      nativeMessage: 'Unable to resolve host',
    }),
    'timeout',
  );
});

test('classifies common Android transport failures without exposing details', () => {
  assert.equal(
    classifyNetworkFailure({
      nativeMessage: 'Unable to resolve host api.example.test',
    }),
    'dns-error',
  );
  assert.equal(
    classifyNetworkFailure({
      nativeMessage: 'CertPathValidatorException: Trust anchor not found',
    }),
    'tls-error',
  );
  assert.equal(
    classifyNetworkFailure({ nativeMessage: 'Connection reset by peer' }),
    'connection-reset',
  );
  assert.equal(
    classifyNetworkFailure({ nativeMessage: 'Connection refused' }),
    'connection-refused',
  );
});

test('classifies common iOS connectivity failures', () => {
  assert.equal(
    classifyNetworkFailure({
      nativeMessage: 'The Internet connection appears to be offline.',
    }),
    'offline',
  );
  assert.equal(
    classifyNetworkFailure({
      nativeMessage: 'The network connection was lost.',
    }),
    'connection-error',
  );
});

test('keeps unknown XHR failures generic', () => {
  assert.equal(
    classifyNetworkFailure({ code: 'ERR_NETWORK', message: 'Network Error' }),
    'network-error',
  );
});

test('reads the private RN transport message without returning it', () => {
  assert.equal(
    classifyNetworkError({
      code: 'ERR_NETWORK',
      message: 'Network Error',
      request: { _response: 'Unable to resolve host private.example.test' },
    }),
    'dns-error',
  );
});
