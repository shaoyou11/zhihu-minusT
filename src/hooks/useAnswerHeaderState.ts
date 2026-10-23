import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { calculateDetailHeaderAppearance } from '@/utils/detailHeaderAppearance';

interface AnswerHeaderState {
  offset: number;
  collapseOffset: number;
  collapsed: boolean;
}

const initialState: AnswerHeaderState = {
  offset: 0,
  collapseOffset: 80,
  collapsed: false,
};

/** Keep header state attached to answer identity, including across list reorders. */
export function useAnswerHeaderState(pagerKey: string, answerId?: string) {
  const scopeSequence = useRef(0);
  const scope = useMemo(
    () => ({ pagerKey, version: ++scopeSequence.current }),
    [pagerKey],
  );
  const headerProgress = useSharedValue(0);
  const activeAnswerId = useSharedValue(answerId ?? '');
  const activeScrollY = useSharedValue(0);
  const activeScopeVersion = useSharedValue(scope.version);
  const active = useRef({ scope, answerId });
  active.current = { scope, answerId };
  const saved = useRef({
    scope,
    answers: new Map<string, AnswerHeaderState>(),
  });
  const [, setDisplayed] = useState({
    scope,
    answerId,
    collapsed: false,
  });

  const read = useCallback(
    (id: string): AnswerHeaderState =>
      saved.current.scope === scope
        ? (saved.current.answers.get(id) ?? initialState)
        : initialState,
    [scope],
  );

  useLayoutEffect(() => {
    if (saved.current.scope !== scope) {
      saved.current = { scope, answers: new Map() };
    }
    activeAnswerId.value = answerId ?? '';
    activeScopeVersion.value = scope.version;
    const state = answerId ? read(answerId) : initialState;
    activeScrollY.value = state.offset;
    headerProgress.value = calculateDetailHeaderAppearance(
      state.offset,
      state.collapseOffset,
    );
  }, [
    scope,
    answerId,
    read,
    activeAnswerId,
    activeScrollY,
    activeScopeVersion,
    headerProgress,
  ]);

  const publish = useCallback(
    (id: string, state: AnswerHeaderState) => {
      if (saved.current.scope !== scope) {
        saved.current = { scope, answers: new Map() };
      }
      saved.current.answers.set(id, state);
      if (active.current.answerId !== id) return;
      setDisplayed((previous) =>
        previous.scope === scope &&
        previous.answerId === id &&
        previous.collapsed === state.collapsed
          ? previous
          : { scope, answerId: id, collapsed: state.collapsed },
      );
    },
    [scope],
  );

  const restore = useCallback(
    (id: string) => {
      if (active.current.scope !== scope) return;
      const changingAnswer = active.current.answerId !== id;
      const outgoingId = active.current.answerId;
      if (
        changingAnswer &&
        outgoingId &&
        activeAnswerId.value === outgoingId &&
        Number.isFinite(activeScrollY.value)
      ) {
        const previous = read(outgoingId);
        const offset = Math.max(0, activeScrollY.value);
        saved.current.answers.set(outgoingId, {
          ...previous,
          offset,
          collapsed: offset > previous.collapseOffset,
        });
      }
      // Set identity before React commits, so a queued outgoing scroll is rejected.
      active.current.answerId = id;
      const state = read(id);
      if (changingAnswer) {
        activeAnswerId.value = id;
        activeScrollY.value = state.offset;
        headerProgress.value = calculateDetailHeaderAppearance(
          state.offset,
          state.collapseOffset,
        );
      }
      publish(id, state);
    },
    [scope, publish, read, activeAnswerId, activeScrollY, headerProgress],
  );

  const onScroll = useCallback(
    (id: string, offset: number) => {
      if (
        active.current.scope !== scope ||
        active.current.answerId !== id ||
        !Number.isFinite(offset)
      )
        return;
      const previous = read(id);
      const nextOffset = Math.max(0, offset);
      publish(id, {
        ...previous,
        offset: nextOffset,
        collapsed: nextOffset > previous.collapseOffset,
      });
    },
    [scope, publish, read],
  );

  const onHeaderLayout = useCallback(
    (id: string, collapseOffset: number) => {
      if (
        active.current.scope !== scope ||
        !Number.isFinite(collapseOffset) ||
        collapseOffset <= 0
      )
        return;
      const previous = read(id);
      publish(id, {
        ...previous,
        collapseOffset,
        collapsed: previous.offset > collapseOffset,
      });
    },
    [scope, publish, read],
  );

  const collapsed = answerId ? read(answerId).collapsed : false;

  return {
    collapsed,
    restore,
    onScroll,
    onHeaderLayout,
    headerProgress,
    activeAnswerId,
    activeScrollY,
    activeScopeVersion,
    scopeVersion: scope.version,
  };
}
