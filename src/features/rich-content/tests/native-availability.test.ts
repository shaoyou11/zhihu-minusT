import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { RichTextNativeViewProps } from '../../../../modules/zhihu-rich-text';

let mockPlatform = 'ios';
const mockNativeComponent = jest.fn(() => null);
const mockRequireOptionalNativeModule = jest.fn();
const mockRequireNativeView = jest.fn();

jest.mock('expo', () => ({
  requireOptionalNativeModule: (...args: unknown[]) =>
    mockRequireOptionalNativeModule(...args),
  requireNativeView: (...args: unknown[]) => mockRequireNativeView(...args),
}));

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatform;
    },
  },
}));

jest.mock('react-native-css-interop', () => ({
  createInteropElement:
    jest.requireActual<typeof import('react')>('react').createElement,
}));

function loadNativeBridge() {
  let bridge: typeof import('../../../../modules/zhihu-rich-text') | undefined;
  jest.isolateModules(() => {
    bridge = require('../../../../modules/zhihu-rich-text');
  });
  if (!bridge) throw new Error('Expected the native bridge');
  return bridge;
}

const props: RichTextNativeViewProps = {
  flowJson: JSON.stringify({ id: 'flow-a', textVersion: 'version-a' }),
  configJson: JSON.stringify({ fontSize: 17, lineHeight: 25.5 }),
  contentWidth: 320,
  layoutKey: 'layout-a',
  selectable: true,
  onHeightChange: jest.fn(),
};

beforeEach(() => {
  mockPlatform = 'ios';
  jest.clearAllMocks();
  mockRequireOptionalNativeModule.mockReset().mockReturnValue({});
  mockRequireNativeView.mockReset().mockReturnValue(mockNativeComponent);
});

describe('native rich text availability', () => {
  it.each(['android', 'ios'])(
    'loads the registered %s view lazily and passes the existing bridge props',
    (platform) => {
      mockPlatform = platform;
      const bridge = loadNativeBridge();
      expect(mockRequireOptionalNativeModule).not.toHaveBeenCalled();
      expect(mockRequireNativeView).not.toHaveBeenCalled();

      expect(bridge.isRichTextNativeAvailable()).toBe(true);
      const element = bridge.RichTextNativeView(props);
      expect(element?.type).toBe(mockNativeComponent);
      expect(element?.props).toEqual(props);
      expect(bridge.isRichTextNativeAvailable()).toBe(true);
      expect(mockRequireOptionalNativeModule).toHaveBeenCalledTimes(1);
      expect(mockRequireOptionalNativeModule).toHaveBeenCalledWith(
        'ZhihuRichText',
      );
      expect(mockRequireNativeView).toHaveBeenCalledTimes(1);
      expect(mockRequireNativeView).toHaveBeenCalledWith('ZhihuRichText');
    },
  );

  it.each(['android', 'ios'])(
    'returns unavailable for a %s client without the module',
    (platform) => {
      mockPlatform = platform;
      mockRequireOptionalNativeModule.mockReturnValue(null);
      const bridge = loadNativeBridge();
      expect(bridge.isRichTextNativeAvailable()).toBe(false);
      expect(bridge.RichTextNativeView(props)).toBeNull();
      expect(mockRequireOptionalNativeModule).toHaveBeenCalledTimes(1);
      expect(mockRequireNativeView).not.toHaveBeenCalled();
    },
  );

  it.each(['web', 'windows', 'macos'])(
    'keeps %s unsupported without requesting a native module or view',
    (platform) => {
      mockPlatform = platform;
      const bridge = loadNativeBridge();
      expect(bridge.isRichTextNativeAvailable()).toBe(false);
      expect(bridge.RichTextNativeView(props)).toBeNull();
      expect(mockRequireOptionalNativeModule).not.toHaveBeenCalled();
      expect(mockRequireNativeView).not.toHaveBeenCalled();
    },
  );

  it('fails closed if the native view cannot be loaded', () => {
    mockRequireNativeView.mockImplementation(() => {
      throw new Error('The client has no native view');
    });
    const bridge = loadNativeBridge();
    expect(bridge.isRichTextNativeAvailable()).toBe(false);
    expect(bridge.RichTextNativeView(props)).toBeNull();
    expect(mockRequireNativeView).toHaveBeenCalledTimes(1);
  });

  it('registers the iOS Swift class alongside the existing Android module', () => {
    const config: unknown = JSON.parse(
      readFileSync(
        path.join(
          __dirname,
          '../../../../modules/zhihu-rich-text/expo-module.config.json',
        ),
        'utf8',
      ),
    );
    expect(config).toEqual({
      platforms: ['apple', 'android'],
      apple: { modules: ['ZhihuRichTextModule'] },
      android: {
        modules: ['com.zhihuminus.richtext.RichTextModule'],
      },
    });
  });
});
