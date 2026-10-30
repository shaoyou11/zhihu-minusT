import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, type ScrollViewProps, Text } from 'react-native';
import {
  getHomeNavigationMetrics,
  ScrollableNavigationRow,
} from '../src/components/home/ScrollableNavigationRow';

const mockScrollTo = jest.fn<
  void,
  [{ x: number; y: number; animated: boolean }]
>();

jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: react.forwardRef((props: ScrollViewProps, ref) => {
      react.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
      return <native.View {...props} />;
    }),
  };
});

beforeEach(() => mockScrollTo.mockClear());

test.each([61, 101, 125, 320, 600])(
  'home controls retain a usable target and scrollable content in a %s-wide pane',
  (paneWidth) => {
    const metrics = getHomeNavigationMetrics(paneWidth, 3);
    expect(metrics.bottomViewportWidth).toBeGreaterThanOrEqual(44);
    expect(metrics.bottomViewportWidth).toBeLessThanOrEqual(paneWidth);
    expect(metrics.bottomButtonWidth).toBeGreaterThanOrEqual(44);
    expect(metrics.bottomContentWidth).toBeGreaterThanOrEqual(
      metrics.bottomViewportWidth,
    );
    expect(metrics.bottomItemWidth * 3).toBe(metrics.bottomContentWidth);
    expect(
      paneWidth - 2 * metrics.topInset - 2 * metrics.topPadding,
    ).toBeGreaterThanOrEqual(54);
  },
);

test.each([101, 125])(
  'scrolls the selected control into a %s-wide viewport and retains working actions',
  async (viewportWidth) => {
    const labels = ['首页', '发布', '我的', '搜索'];
    const actions = labels.map(() => jest.fn());
    const row = (selected: number) => (
      <ScrollableNavigationRow
        testID="navigation"
        contentWidth={4 * 64}
        activeStart={selected * 64 + 10}
        activeEnd={selected * 64 + 54}
      >
        {labels.map((label, index) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={actions[index]}
          >
            <Text>{label}</Text>
          </Pressable>
        ))}
      </ScrollableNavigationRow>
    );
    const host = await render(row(0));
    await fireEvent(host.getByTestId('navigation'), 'layout', {
      nativeEvent: { layout: { width: viewportWidth, height: 64, x: 0, y: 0 } },
    });
    expect(mockScrollTo).not.toHaveBeenCalled();

    for (let selected = 0; selected < labels.length; selected += 1) {
      await host.rerender(row(selected));
      const offset = mockScrollTo.mock.calls.at(-1)?.[0].x ?? 0;
      expect(offset).toBeLessThanOrEqual(selected * 64 + 10);
      expect(offset + viewportWidth).toBeGreaterThanOrEqual(selected * 64 + 54);
      await fireEvent.press(
        host.getByRole('button', { name: labels[selected] }),
      );
      expect(actions[selected]).toHaveBeenCalledTimes(1);
    }
  },
);

test('rechecks the active control after shrinking and restores the origin when expanded', async () => {
  const host = await render(
    <ScrollableNavigationRow
      testID="navigation"
      contentWidth={256}
      activeStart={202}
      activeEnd={246}
    >
      <Text>搜索</Text>
    </ScrollableNavigationRow>,
  );
  const resize = (width: number) =>
    fireEvent(host.getByTestId('navigation'), 'layout', {
      nativeEvent: { layout: { width, height: 64, x: 0, y: 0 } },
    });
  await resize(400);
  expect(mockScrollTo).not.toHaveBeenCalled();
  await resize(101);
  expect(mockScrollTo).toHaveBeenLastCalledWith({
    x: 145,
    y: 0,
    animated: false,
  });
  await resize(400);
  expect(mockScrollTo).toHaveBeenLastCalledWith({
    x: 0,
    y: 0,
    animated: false,
  });
});

test('leaves a manually scrolled row alone when its active control remains visible', async () => {
  const row = (activeStart: number) => (
    <ScrollableNavigationRow
      testID="navigation"
      contentWidth={300}
      activeStart={activeStart}
      activeEnd={activeStart + 44}
    >
      <Text>导航</Text>
    </ScrollableNavigationRow>
  );
  const host = await render(row(80));
  await fireEvent(host.getByTestId('navigation'), 'layout', {
    nativeEvent: { layout: { width: 125, height: 64, x: 0, y: 0 } },
  });
  await fireEvent.scroll(host.getByTestId('navigation'), {
    nativeEvent: { contentOffset: { x: 60, y: 0 } },
  });
  mockScrollTo.mockClear();
  await host.rerender(row(100));
  expect(mockScrollTo).not.toHaveBeenCalled();
});
