import { usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { publishingDraftRepository } from '@/storage/publishingDraftRepository';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { resolveLocalAccountKey } from '@/utils/localAccount';
import { showToast } from '@/utils/toast';
import {
  emptyPublishingDraft,
  type PublishingDraftScope,
  type PublishingDraftValue,
} from './types';

const EMPTY = emptyPublishingDraft();

export function usePublishingDraft(
  kind: PublishingDraftScope['kind'],
  target: string,
  initialValue: PublishingDraftValue = EMPTY,
  enabled = true,
  busy = false,
  submitting = false,
) {
  const accountId = useAuthStore((state) => state.me?.id || null);
  const urlToken = useAuthStore((state) => state.me?.url_token || null);
  const authenticated = useAuthStore((state) => Boolean(state.cookies));
  // Auth transitions may keep the same identity and Cookie text. Select the
  // version on every store update so those transitions still remount the editor.
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const scope = useMemo<
    (PublishingDraftScope & { sessionVersion: number }) | null
  >(() => {
    const accountKey = resolveLocalAccountKey(
      { id: accountId, url_token: urlToken },
      authenticated,
    );
    return authenticated && accountKey && accountKey !== 'guest'
      ? {
          accountKey,
          kind,
          target,
          sessionVersion,
          generation: publishingDraftRepository.getGeneration(accountKey),
        }
      : null;
  }, [accountId, urlToken, authenticated, kind, target, sessionVersion]);
  const [snapshot, setSnapshot] = useState<{
    scope: PublishingDraftScope;
    value: PublishingDraftValue;
    conflict: PublishingDraftValue | null;
  } | null>(null);
  const [status, setStatus] = useState<'unsaved' | 'saved' | 'failed'>(
    'unsaved',
  );
  const [readFailure, setReadFailure] = useState<PublishingDraftScope | null>(
    null,
  );
  const [readAttempt, setReadAttempt] = useState(0);
  const activeScopeRef = useRef(scope);
  activeScopeRef.current = scope;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const readFailureRef = useRef(readFailure);
  readFailureRef.current = readFailure;
  const value = snapshot?.scope === scope ? snapshot.value : initialValue;
  const ready = Boolean(
    enabled && scope && snapshot?.scope === scope && readFailure !== scope,
  );
  const valueRef = useRef(value);
  valueRef.current = value;
  const initialJson = JSON.stringify(initialValue);
  const dirty = ready && JSON.stringify(value) !== initialJson;
  const outgoingValueRef = useRef<{
    scope: PublishingDraftScope;
    value: PublishingDraftValue;
    dirty: boolean;
  } | null>(null);
  if (ready && scope) outgoingValueRef.current = { scope, value, dirty };
  const finishedScopesRef = useRef(new Set<PublishingDraftScope>());
  const skipLeaveRef = useRef(false);
  const [leaveAllowed, setLeaveAllowed] = useState(false);

  useEffect(
    () => () => {
      const outgoing = outgoingValueRef.current;
      if (
        scope &&
        outgoing?.scope === scope &&
        outgoing.dirty &&
        !finishedScopesRef.current.has(scope)
      ) {
        void publishingDraftRepository
          .save(scope, outgoing.value)
          .catch(() => showToast('草稿保存失败，请检查存储空间后重试'));
      }
    },
    [scope],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: readAttempt is an explicit retry trigger for the same draft scope.
  useEffect(() => {
    if (!scope || !enabled) return;
    let cancelled = false;
    setStatus('unsaved');
    setReadFailure(null);
    skipLeaveRef.current = false;
    setLeaveAllowed(false);
    void publishingDraftRepository
      .read(scope)
      .then((saved) => {
        if (cancelled) return;
        const conflict =
          saved &&
          initialValue.document &&
          saved.document?.originalHtml !== initialValue.document.originalHtml
            ? saved
            : null;
        setSnapshot({
          scope,
          value: conflict ? initialValue : (saved ?? initialValue),
          conflict,
        });
        if (saved && !conflict) setStatus('saved');
      })
      .catch(() => {
        if (cancelled) return;
        // A read failure is not an empty draft. Keep editing and saving closed
        // until a successful retry can establish the stored snapshot.
        setSnapshot(null);
        setReadFailure(scope);
        setStatus('failed');
        showToast('无法读取本地草稿，请检查存储空间');
      });
    return () => {
      cancelled = true;
    };
  }, [scope, enabled, initialValue, readAttempt]);

  const update = useCallback(
    (patch: Partial<PublishingDraftValue>) => {
      if (!ready || !scope || activeScopeRef.current !== scope) return;
      setSnapshot((current) =>
        current?.scope === scope && !current.conflict
          ? { ...current, value: { ...current.value, ...patch } }
          : current,
      );
      setStatus('unsaved');
    },
    [scope, ready],
  );

  const save = useCallback(
    async (snapshotValue = valueRef.current) => {
      if (
        !ready ||
        !scope ||
        activeScopeRef.current !== scope ||
        skipLeaveRef.current ||
        getAuthSessionVersion() !== sessionVersion ||
        snapshot?.conflict
      )
        return false;
      try {
        await publishingDraftRepository.save(scope, snapshotValue);
        if (
          activeScopeRef.current === scope &&
          getAuthSessionVersion() === sessionVersion &&
          valueRef.current === snapshotValue
        )
          setStatus('saved');
        return (
          activeScopeRef.current === scope &&
          getAuthSessionVersion() === sessionVersion
        );
      } catch {
        if (activeScopeRef.current === scope) {
          setStatus('failed');
          showToast('草稿保存失败，请检查存储空间后重试');
        }
        return false;
      }
    },
    [scope, ready, sessionVersion, snapshot?.conflict],
  );

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void save(value), 600);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void save();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [dirty, value, save]);

  const complete = useCallback(async () => {
    if (activeScopeRef.current !== scope) return false;
    skipLeaveRef.current = true;
    if (scope) finishedScopesRef.current.add(scope);
    try {
      if (scope) await publishingDraftRepository.remove(scope);
    } catch (error) {
      if (activeScopeRef.current === scope) skipLeaveRef.current = false;
      if (scope) finishedScopesRef.current.delete(scope);
      throw error;
    }
    if (activeScopeRef.current === scope) setLeaveAllowed(true);
    return true;
  }, [scope]);

  const disablePrevention = usePreventRemove(
    (dirty || busy || submitting) && !leaveAllowed,
    ({ repeat }) => {
      if (skipLeaveRef.current) return;
      if (submitting) {
        Alert.alert('正在提交', '请等待提交结果确认后再离开，避免重复发布。');
        return;
      }
      Alert.alert('离开编辑？', '可以保存本地草稿，下次从同一账号继续编辑。', [
        { text: '继续编辑', style: 'cancel' },
        {
          text: '放弃草稿',
          style: 'destructive',
          onPress: () => {
            void complete()
              .then((completed) => {
                if (completed && activeScopeRef.current === scope) repeat();
              })
              .catch(() => showToast('清理草稿失败，请重试'));
          },
        },
        {
          text: '保存并离开',
          onPress: () => {
            void save().then((saved) => {
              if (saved) {
                skipLeaveRef.current = true;
                setLeaveAllowed(true);
                repeat();
              }
            });
          },
        },
      ]);
    },
  );

  const completePublished = useCallback(async () => {
    // The server has accepted this submission; local cleanup must never turn it
    // into a retryable publishing failure or recreate the submitted draft.
    if (activeScopeRef.current === scope) {
      skipLeaveRef.current = true;
      setLeaveAllowed(true);
      disablePrevention();
    }
    if (scope) finishedScopesRef.current.add(scope);
    try {
      if (scope) await publishingDraftRepository.remove(scope);
    } catch {
      showToast('发布已成功，但本地草稿清理失败，请勿重复发布');
    }
  }, [scope, disablePrevention]);

  const restoreConflict = () => {
    const conflict = snapshot?.scope === scope ? snapshot.conflict : null;
    if (!conflict) return;
    Alert.alert(
      '恢复旧草稿？',
      '线上内容已变化。恢复后再次保存会覆盖线上版本，请先核对所有内容。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '恢复草稿',
          onPress: () => {
            if (
              activeScopeRef.current !== scope ||
              snapshotRef.current?.conflict !== conflict
            )
              return;
            setSnapshot((current) =>
              current?.scope === scope
                ? { ...current, value: conflict, conflict: null }
                : current,
            );
            setStatus('unsaved');
          },
        },
      ],
    );
  };

  const discardConflict = () => {
    if (!scope || snapshot?.scope !== scope || !snapshot.conflict) return;
    Alert.alert('使用线上版本？', '旧的本地草稿及其图片副本将被删除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '使用线上版本',
        style: 'destructive',
        onPress: () => {
          if (
            activeScopeRef.current !== scope ||
            !snapshotRef.current?.conflict
          )
            return;
          void publishingDraftRepository
            .remove(scope)
            .then(() => {
              if (activeScopeRef.current !== scope) return;
              setSnapshot((current) =>
                current?.scope === scope
                  ? { ...current, conflict: null }
                  : current,
              );
              setStatus('unsaved');
            })
            .catch(() => showToast('清理旧草稿失败，请重试'));
        },
      },
    ]);
  };

  const retryRead = () => {
    if (!scope || readFailure !== scope) return;
    setReadFailure(null);
    setSnapshot(null);
    setReadAttempt((attempt) => attempt + 1);
  };

  const discardUnreadable = () => {
    if (!scope || readFailure !== scope) return;
    Alert.alert(
      '删除未能读取的草稿？',
      '当前账号这份草稿及图片副本将被删除。确认后可重新编辑，线上内容不会删除。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除本地草稿',
          style: 'destructive',
          onPress: () => {
            if (
              activeScopeRef.current !== scope ||
              readFailureRef.current !== scope
            )
              return;
            void publishingDraftRepository
              .remove(scope)
              .then(() => {
                if (activeScopeRef.current !== scope) return;
                retryRead();
              })
              .catch(() => showToast('清理草稿失败，请重试'));
          },
        },
      ],
    );
  };

  return {
    scope,
    scopeKey: scope
      ? `${scope.accountKey}:${kind}:${target}:${sessionVersion}`
      : 'unbound',
    value,
    ready,
    readFailed: Boolean(enabled && scope && readFailure === scope),
    retryRead,
    discardUnreadable,
    dirty,
    status,
    update,
    save,
    complete,
    completePublished,
    hasConflict: Boolean(snapshot?.scope === scope && snapshot.conflict),
    restoreConflict,
    discardConflict,
  };
}
