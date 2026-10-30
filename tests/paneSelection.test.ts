import {
  type Href,
  isActionHandled,
  type StackNavigationState,
} from 'expo-router';
import { PaneStackRouter } from '../src/features/adaptive-layout/PaneStackRouter';
import { resolvePaneDetailHref } from '../src/features/adaptive-layout/selection';

type TestState = StackNavigationState<
  Record<string, Record<string, unknown> | undefined>
>;

const names = [
  '(tabs)',
  'question/[id]/index',
  'user/[id]/index',
  'answer/[id]',
  'article/[id]',
  'comments/[id]',
  'comments/replies/[id]',
  'login/index',
];
const config = { routeNames: names, routeGetIdList: {} };
const router = PaneStackRouter({ initialRouteName: '(tabs)' });
const home = { key: 'home', name: '(tabs)' };
const answer = {
  key: 'answer-a',
  name: 'answer/[id]',
  params: { id: 'a', title: 'old' },
};
const comment = {
  key: 'comments-c',
  name: 'comments/[id]',
  params: { id: 'c' },
};
const user = { key: 'user-u', name: 'user/[id]/index', params: { id: 'u' } };

function state(
  routes: TestState['routes'],
  index = routes.length - 1,
): TestState {
  return {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 30,
    routeNames: names,
    routes,
    index,
  };
}

function selection(id: string, source = 'home') {
  return {
    type: 'PUSH' as const,
    target: 'root',
    payload: {
      name: 'answer/[id]',
      params: { id },
      paneSelectionSource: source,
    },
  };
}

test('known root detail URLs preserve params and dynamic IDs without resolving unrelated links', () => {
  expect(resolvePaneDetailHref('/answer/a?questionId=q&tag=x&tag=y')).toEqual({
    name: 'answer/[id]',
    params: { id: 'a', questionId: 'q', tag: ['x', 'y'] },
  });
  expect(
    resolvePaneDetailHref({
      pathname: '/answer/[id]',
      params: { id: 42, readingMode: 'detail', questionId: 'q' },
    }),
  ).toEqual({
    name: 'answer/[id]',
    params: { id: '42', readingMode: 'detail', questionId: 'q' },
  });
  expect(resolvePaneDetailHref('/comments/replies/a%20b')).toEqual({
    name: 'comments/replies/[id]',
    params: { id: 'a b' },
  });
  expect(resolvePaneDetailHref('/settings/appearance')).toEqual({
    name: 'settings/appearance',
    params: {},
  });
  expect(
    resolvePaneDetailHref({
      pathname: '/guest/detail',
      params: { item: 'synthetic' },
    }),
  ).toEqual({ name: 'guest/detail', params: { item: 'synthetic' } });
  for (const href of [
    '../answer/a',
    'https://example.invalid/answer/a',
    '//example.invalid/answer/a',
    '/question/a',
    '/settings',
    '/settings/unknown',
    '/answer/%zz',
    '/answer/a/b',
    '/answer/a#heading',
    '/answer/..',
  ]) {
    expect(resolvePaneDetailHref(href as Href)).toBeNull();
  }
});

test('a first selection opens normally; same-list reselection replaces the detail branch and browser entry', () => {
  const first = router.getStateForAction(state([home]), selection('a'), config);
  expect(isActionHandled(first)).toBe(true);
  if (!isActionHandled(first)) throw new Error('selection unhandled');
  expect(first.state.routes).toHaveLength(2);
  expect(first.browserHistory).toEqual({ type: 'push' });
  const replaced = router.getStateForAction(
    state([home, answer]),
    selection('b'),
    config,
  );
  if (!isActionHandled(replaced)) throw new Error('selection unhandled');
  expect(
    replaced.state.routes.map((route) =>
      route.params && 'id' in route.params ? route.params.id : undefined,
    ),
  ).toEqual([undefined, 'b']);
  expect(replaced.state.routes[0]).toBe(home);
  expect(replaced.state.routes[1].key).not.toBe(answer.key);
  expect(replaced.state.routeKeySeq).toBeGreaterThan(30);
  expect(replaced.browserHistory).toEqual({ type: 'replace' });
  const closed = router.getStateForAction(
    replaced.state,
    { type: 'GO_BACK' },
    config,
  );
  if (!isActionHandled(closed)) throw new Error('back unhandled');
  expect(closed.state.routes).toEqual([home]);
});

test('reselection reuses matching detail keys and removes comments while retaining preloads', () => {
  const preload = {
    key: 'preloaded-article',
    name: 'article/[id]',
    params: { id: 'future' },
    isPreloaded: true as const,
  };
  const previous = state([home, answer, comment, preload], 2);
  const selected = router.getStateForAction(previous, selection('a'), config);
  if (!isActionHandled(selected)) throw new Error('selection unhandled');
  expect(selected.state.routes.map((route) => route.key)).toEqual([
    'home',
    'answer-a',
    'preloaded-article',
  ]);
  expect(selected.state.routes[2]).toBe(preload);
  expect(selected.state.index).toBe(1);
  expect(selected.state.routeKeySeq).toBe(30);
  expect(selected.affectedRouteKey).toBe('answer-a');
  expect(selected.state.routes[1].params).toEqual({ id: 'a' });
  expect(selected.browserHistory).toEqual({
    type: 'pop',
    count: 1,
    target: { navigatorKey: 'root', routeKey: 'answer-a' },
  });
  expect(previous.routes.map((route) => route.key)).toEqual([
    'home',
    'answer-a',
    'comments-c',
    'preloaded-article',
  ]);
});

test('a new selection retains preloads and earlier list history but cannot trim across another list or full-screen route', () => {
  const selected = router.getStateForAction(
    state([
      home,
      answer,
      user,
      { ...answer, key: 'answer-old', params: { id: 'old' } },
    ]),
    selection('new', 'user-u'),
    config,
  );
  if (!isActionHandled(selected)) throw new Error('selection unhandled');
  expect(selected.state.routes.slice(0, 3)).toEqual([home, answer, user]);
  expect(selected.state.routes[3].params).toEqual({ id: 'new' });
  const preload = {
    key: 'preload',
    name: 'article/[id]',
    params: { id: 'future' },
    isPreloaded: true as const,
  };
  const withPreload = router.getStateForAction(
    state([home, answer, comment, preload], 2),
    selection('new'),
    config,
  );
  if (!isActionHandled(withPreload)) throw new Error('selection unhandled');
  expect(withPreload.state.index).toBe(1);
  expect(withPreload.state.routes[2]).toBe(preload);
  expect(withPreload.state.routes[1].params).toEqual({ id: 'new' });
  for (const routes of [
    [home, answer, user],
    [home, answer, { key: 'login', name: 'login/index' }],
  ]) {
    const invalid = router.getStateForAction(
      state(routes),
      selection('new'),
      config,
    );
    if (!isActionHandled(invalid)) throw new Error('selection unhandled');
    expect(invalid.state.routes.slice(0, routes.length)).toEqual(routes);
    expect(invalid.state.routes).toHaveLength(routes.length + 1);
  }
});

test('unmarked detail links, parameter updates and comment backs keep normal stack behavior', () => {
  const previous = state([home, answer]);
  const linkedAnswer = router.getStateForAction(
    previous,
    {
      type: 'PUSH',
      payload: { name: 'answer/[id]', params: { id: 'linked' } },
    },
    config,
  );
  if (!isActionHandled(linkedAnswer)) throw new Error('push unhandled');
  expect(linkedAnswer.state.routes).toHaveLength(3);
  expect(linkedAnswer.state.routes[1]).toBe(answer);
  const linked = router.getStateForAction(
    previous,
    { type: 'PUSH', payload: { name: 'comments/[id]', params: { id: 'c' } } },
    config,
  );
  if (!isActionHandled(linked)) throw new Error('push unhandled');
  expect(linked.state.routes).toHaveLength(3);
  const back = router.getStateForAction(
    linked.state,
    { type: 'GO_BACK' },
    config,
  );
  if (!isActionHandled(back)) throw new Error('back unhandled');
  expect(back.state.routes).toEqual(previous.routes);
  const updated = router.getStateForAction(
    previous,
    {
      type: 'SET_PARAMS',
      source: answer.key,
      payload: { params: { id: 'switched' } },
    },
    config,
  );
  if (!isActionHandled(updated)) throw new Error('params unhandled');
  expect(updated.state.routes[1].key).toBe(answer.key);
  expect(updated.state.routes[1].params).toMatchObject({ id: 'switched' });
});

test.each([
  { name: 'comments/[id]', old: { type: 'answer' }, next: { type: 'article' } },
  {
    name: 'comments/[id]',
    old: { type: 'answer', segmentId: 'one' },
    next: { type: 'answer', segmentId: 'two' },
  },
  {
    name: 'comments/replies/[id]',
    old: { resourceType: 'answers', resourceId: 'one' },
    next: { resourceType: 'pins', resourceId: 'one' },
  },
  { name: 'article/[id]', old: { source: 'daily' }, next: {} },
])(
  'equal numeric IDs do not reuse state across $name content identities',
  ({ name, old, next }) => {
    const previous = state([
      home,
      { key: 'old-detail', name, params: { id: '42', ...old } },
    ]);
    const action = {
      type: 'PUSH' as const,
      target: 'root',
      payload: {
        name,
        params: { id: '42', ...next },
        paneSelectionSource: 'home',
      },
    };
    const result = router.getStateForAction(previous, action, config);
    if (!isActionHandled(result)) throw new Error('selection unhandled');
    expect(result.state.routes).toHaveLength(2);
    expect(result.state.routes[1].key).not.toBe('old-detail');
    expect(result.state.routes[1].params).toEqual({ id: '42', ...next });
  },
);
