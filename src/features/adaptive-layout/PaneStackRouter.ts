import {
  isActionHandled,
  type NavigationAction,
  type RouterBrowserHistoryAction,
  StackRouter,
  type StackRouterOptions,
} from 'expo-router';
import { getPaneRole } from './layout';

type BaseRouter = ReturnType<typeof StackRouter>;
type StackState = Parameters<BaseRouter['getStateForAction']>[0];
type StackAction = Parameters<BaseRouter['getStateForAction']>[1];
type SelectionAction = {
  type: 'PUSH';
  payload: {
    name: string;
    params?: object;
    paneSelectionSource: string;
  };
  source?: string;
  target?: string;
};

function isSelectionAction(
  action: NavigationAction,
): action is SelectionAction {
  return (
    action.type === 'PUSH' &&
    !!action.payload &&
    'paneSelectionSource' in action.payload &&
    typeof action.payload.paneSelectionSource === 'string' &&
    'name' in action.payload &&
    typeof action.payload.name === 'string'
  );
}

function findSelectionSource(state: StackState, sourceKey: string): number {
  for (let index = state.index; index >= 0; index--) {
    const route = state.routes[index];
    const role = getPaneRole(route.name);
    if (role === 'full') return -1;
    if (role === 'list') return route.key === sourceKey ? index : -1;
  }
  return -1;
}

function sameDetail(
  route: StackState['routes'][number],
  action: SelectionAction,
): boolean {
  if (route.name !== action.payload.name) return false;
  const params = action.payload.params;
  const id = params && 'id' in params ? params.id : undefined;
  const oldParams = route.params;
  const oldId = oldParams && 'id' in oldParams ? oldParams.id : undefined;
  if (id != null || oldId != null) {
    if (id == null || oldId == null || String(id) !== String(oldId))
      return false;
    const identityFields =
      route.name === 'comments/[id]'
        ? ['type', 'segmentId', 'pid', 'startOffset', 'endOffset']
        : route.name === 'comments/replies/[id]'
          ? ['resourceType', 'resourceId']
          : route.name === 'article/[id]'
            ? ['source']
            : [];
    return identityFields.every(
      (key) => identityParam(params, key) === identityParam(oldParams, key),
    );
  }
  // Static settings pages have no entity identity. Guest previews do.
  if (route.name === 'guest/detail') {
    return (
      !!params &&
      'item' in params &&
      !!oldParams &&
      'item' in oldParams &&
      params.item === oldParams.item
    );
  }
  return route.name.startsWith('settings/');
}

function identityParam(
  params: object | undefined,
  key: string,
): string | undefined {
  if (!params || !(key in params)) return undefined;
  const value: unknown = Reflect.get(params, key);
  return value == null ? undefined : String(value);
}

function selectionHistory(
  state: StackState,
  sourceIndex: number,
): RouterBrowserHistoryAction {
  const depth = state.index - sourceIndex;
  if (depth <= 1) return { type: 'replace' };
  return {
    type: 'pop',
    count: depth - 1,
    target: {
      navigatorKey: state.key,
      routeKey: state.routes[sourceIndex + 1].key,
    },
  };
}

/** A list selection replaces only its own detail branch; every other action is unchanged. */
export function PaneStackRouter(options: StackRouterOptions): BaseRouter {
  const original = StackRouter(options);
  return {
    ...original,
    getStateForAction(state, action: StackAction, config) {
      if (
        !isSelectionAction(action) ||
        (action.target !== undefined && action.target !== state.key) ||
        getPaneRole(action.payload.name) !== 'detail' ||
        !state.routeNames.includes(action.payload.name)
      ) {
        return original.getStateForAction(state, action, config);
      }
      const sourceIndex = findSelectionSource(
        state,
        action.payload.paneSelectionSource,
      );
      if (sourceIndex < 0 || sourceIndex === state.index) {
        return original.getStateForAction(state, action, config);
      }
      const prefix = state.routes.slice(0, sourceIndex + 1);
      const preloaded = state.routes.slice(state.index + 1);
      const existing = state.routes
        .slice(sourceIndex + 1, state.index + 1)
        .find((route) => sameDetail(route, action));
      const browserHistory = selectionHistory(state, sourceIndex);
      if (existing) {
        return {
          state: {
            ...state,
            index: prefix.length,
            routes: [
              ...prefix,
              { ...existing, params: action.payload.params },
              ...preloaded,
            ],
          },
          affectedRouteKey: existing.key,
          browserHistory,
        };
      }
      const result = original.getStateForAction(
        {
          ...state,
          index: sourceIndex,
          routes: [...prefix, ...preloaded],
        },
        action,
        config,
      );
      return isActionHandled(result) ? { ...result, browserHistory } : result;
    },
  };
}
