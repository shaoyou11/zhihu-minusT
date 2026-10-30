import { act, renderHook } from '@testing-library/react-native';
import {
  NavigationContext,
  type NavigationProp,
  NavigationRouteContext,
  type NavigationState,
  type ParamListBase,
} from 'expo-router/react-navigation';
import { type PropsWithChildren, useState } from 'react';
import {
  PaneContext,
  usePaneActive,
  usePaneDimensions,
  usePaneVisible,
} from '../src/features/adaptive-layout/PaneContext';

const mockWindow = {
  width: 1200,
  height: 800,
  scale: 2,
  fontScale: 1.4,
};
let mockFocused = false;

jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

test('uses window dimensions and remains visible outside a pane', async () => {
  const host = await renderHook(() => ({
    dimensions: usePaneDimensions(),
    visible: usePaneVisible(),
    active: usePaneActive(),
  }));
  expect(host.result.current.dimensions).toEqual(mockWindow);
  expect(host.result.current.visible).toBe(true);
  expect(host.result.current.active).toBe(false);
  mockFocused = true;
  await host.rerender(undefined);
  expect(host.result.current.active).toBe(true);
  mockFocused = false;
});

test('updates pane bounds and visibility without losing page state or accessibility scale', async () => {
  let pane = { width: 360, height: 800, visible: true };
  const wrapper = ({ children }: PropsWithChildren) => (
    <PaneContext.Provider value={pane}>{children}</PaneContext.Provider>
  );
  const host = await renderHook(
    () => {
      const [draft, setDraft] = useState('');
      return {
        dimensions: usePaneDimensions(),
        visible: usePaneVisible(),
        active: usePaneActive(),
        draft,
        setDraft,
      };
    },
    { wrapper },
  );
  await act(() => host.result.current.setDraft('尚未发送的评论'));
  expect(host.result.current.active).toBe(true);
  expect(host.result.current.dimensions).toEqual({
    ...mockWindow,
    width: pane.width,
    height: pane.height,
  });

  pane = { width: 800, height: 1200, visible: false };
  await host.rerender(undefined);
  expect(host.result.current.visible).toBe(false);
  expect(host.result.current.active).toBe(false);
  expect(host.result.current.draft).toBe('尚未发送的评论');
  expect(host.result.current.dimensions).toEqual({
    ...mockWindow,
    width: pane.width,
    height: pane.height,
  });

  pane = { width: 420, height: 800, visible: true };
  await host.rerender(undefined);
  expect(host.result.current.visible).toBe(true);
  expect(host.result.current.draft).toBe('尚未发送的评论');
  expect(host.result.current.dimensions.width).toBe(420);
});

function navigatorState(
  key: string,
  routes: NavigationState['routes'],
  index: number,
): NavigationState {
  return {
    key,
    routeKeySeq: routes.length,
    routes,
    index,
    stale: false,
    type: 'tab',
    routeNames: routes.map((route) => route.name),
  };
}

function navigationSource(
  initialState: NavigationState,
  parent?: NavigationProp<ParamListBase>,
) {
  let state = initialState;
  const listeners = new Set<() => void>();
  // This fixture implements the public read/subscription methods used by the hook.
  const navigation = {
    getState: () => state,
    getParent: () => parent,
    addListener: (_event: string, listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as NavigationProp<ParamListBase>;
  return {
    navigation,
    setState(next: NavigationState) {
      state = next;
      for (const listener of listeners) listener();
    },
  };
}

test('only the selected native tab is active while its root pane remains visible beside a focused detail', async () => {
  const home = { key: 'home', name: 'index' };
  const profile = { key: 'profile', name: 'profile' };
  const tabsState = navigatorState('tabs-state', [home, profile], 0);
  const root = navigationSource(
    navigatorState(
      'root-state',
      [
        { key: 'tabs-pane', name: '(tabs)', state: tabsState },
        { key: 'detail-pane', name: 'answer/[id]' },
      ],
      1,
    ),
  );
  const tabs = navigationSource(tabsState, root.navigation);
  let route = home;
  let paneVisible = true;
  const wrapper = ({ children }: PropsWithChildren) => (
    <PaneContext.Provider
      value={{
        routeKey: 'tabs-pane',
        width: 360,
        height: 800,
        visible: paneVisible,
      }}
    >
      <NavigationContext.Provider value={tabs.navigation}>
        <NavigationRouteContext.Provider value={route}>
          {children}
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    </PaneContext.Provider>
  );
  const host = await renderHook(usePaneActive, { wrapper });
  expect(mockFocused).toBe(false);
  expect(host.result.current).toBe(true);
  await act(() => tabs.setState({ ...tabsState, index: 1 }));
  expect(host.result.current).toBe(false);
  route = profile;
  await host.rerender(undefined);
  expect(host.result.current).toBe(true);
  paneVisible = false;
  await host.rerender(undefined);
  expect(host.result.current).toBe(false);
});

test('a selected child stack cannot activate its unselected ancestor tab', async () => {
  const leaf = { key: 'leaf', name: 'index' };
  const childState = navigatorState('child-state', [leaf], 0);
  const tabsState = navigatorState(
    'tabs-state',
    [
      { key: 'home', name: 'home', state: childState },
      { key: 'profile', name: 'profile' },
    ],
    1,
  );
  const root = navigationSource(
    navigatorState(
      'root-state',
      [{ key: 'tabs-pane', name: '(tabs)', state: tabsState }],
      0,
    ),
  );
  const tabs = navigationSource(tabsState, root.navigation);
  const child = navigationSource(childState, tabs.navigation);
  const wrapper = ({ children }: PropsWithChildren) => (
    <PaneContext.Provider
      value={{ routeKey: 'tabs-pane', width: 360, height: 800, visible: true }}
    >
      <NavigationContext.Provider value={child.navigation}>
        <NavigationRouteContext.Provider value={leaf}>
          {children}
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    </PaneContext.Provider>
  );
  const host = await renderHook(usePaneActive, { wrapper });
  expect(host.result.current).toBe(false);
  await act(() => tabs.setState({ ...tabsState, index: 0 }));
  expect(host.result.current).toBe(true);
});
