import { useEffect, useRef, useState } from 'react';
import {
  type ApkUpdate,
  cleanupUpdatePartials,
  discardVerifiedApk,
  downloadVerifiedApk,
  installVerifiedApk,
} from '@/utils/updateDownload';
import { assertUpdateActive, UpdateFailure } from '@/utils/updateSecurity';

export type UpdateDownloadState =
  | { phase: 'downloading'; update: ApkUpdate; progress: number }
  | { phase: 'verifying'; update: ApkUpdate }
  | { phase: 'cancelling'; update: ApkUpdate }
  | { phase: 'ready'; update: ApkUpdate; uri: string }
  | { phase: 'installing'; update: ApkUpdate; uri: string }
  | { phase: 'failed'; update: ApkUpdate; message: string; uri?: string };

function discard(uri: string) {
  void discardVerifiedApk(uri).catch(() =>
    console.warn('清理更新临时文件失败'),
  );
}

/** Owned by the root layout so route changes do not cancel an update. */
export function useUpdateDownload() {
  const [state, setState] = useState<UpdateDownloadState | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const readyFileRef = useRef<{ uri: string; handedOff: boolean } | null>(null);
  const cleanupRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    cleanupRef.current = cleanupUpdatePartials().catch(() =>
      console.warn('清理更新临时文件失败'),
    );
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      const file = readyFileRef.current;
      readyFileRef.current = null;
      if (file && !file.handedOff) discard(file.uri);
    };
  }, []);

  const start = (update: ApkUpdate) => {
    if (!mountedRef.current || controllerRef.current || readyFileRef.current)
      return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ phase: 'downloading', update, progress: 0 });
    const active = () =>
      mountedRef.current &&
      controllerRef.current === controller &&
      !controller.signal.aborted;
    void cleanupRef.current
      .then(() => {
        assertUpdateActive(controller.signal);
        return downloadVerifiedApk(update, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (!active() || !Number.isFinite(progress)) return;
            setState((current) =>
              current?.phase === 'downloading'
                ? { ...current, progress: Math.max(0, Math.min(1, progress)) }
                : current,
            );
          },
          onPhase: (phase) => {
            if (active() && phase === 'verifying') setState({ phase, update });
          },
        });
      })
      .then((uri) => {
        if (!active()) {
          discard(uri);
          if (mountedRef.current && controllerRef.current === controller)
            setState(null);
          return;
        }
        readyFileRef.current = { uri, handedOff: false };
        setState({ phase: 'ready', update, uri });
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || controllerRef.current !== controller) return;
        if (
          controller.signal.aborted ||
          (error instanceof UpdateFailure && error.code === 'cancelled')
        ) {
          setState(null);
          return;
        }
        setState({
          phase: 'failed',
          update,
          message:
            error instanceof UpdateFailure ? error.message : '更新失败，请重试',
        });
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
  };

  const cancel = () => {
    if (
      !controllerRef.current ||
      (state?.phase !== 'downloading' && state?.phase !== 'verifying')
    )
      return;
    controllerRef.current.abort();
    setState({ phase: 'cancelling', update: state.update });
  };

  const dismiss = () => {
    if (controllerRef.current) return;
    const file = readyFileRef.current;
    readyFileRef.current = null;
    setState(null);
    if (file && !file.handedOff) discard(file.uri);
  };

  const install = () => {
    if (
      !mountedRef.current ||
      controllerRef.current ||
      (state?.phase !== 'ready' && state?.phase !== 'failed') ||
      !state.uri ||
      readyFileRef.current?.uri !== state.uri
    )
      return;
    const { uri, update } = state;
    const file = readyFileRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    // The installer now owns the file's cleanup and handoff lifecycle.
    readyFileRef.current = null;
    setState({ phase: 'installing', uri, update });
    void installVerifiedApk(uri, {
      signal: controller.signal,
      retainOnFailure: true,
      alreadyHandedOff: file.handedOff,
    })
      .then(() => {
        // The activity promise also resolves when the user cancels installation.
        if (mountedRef.current && controllerRef.current === controller) {
          readyFileRef.current = { uri, handedOff: true };
          setState({ phase: 'ready', uri, update });
        }
      })
      .catch((error: unknown) => {
        if (
          !mountedRef.current ||
          controllerRef.current !== controller ||
          controller.signal.aborted
        )
          return;
        readyFileRef.current = file;
        setState({
          phase: 'failed',
          update,
          uri,
          message:
            error instanceof UpdateFailure
              ? error.message
              : '无法启动安装，请重试',
        });
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
  };

  const retry = () => {
    if (state?.phase !== 'failed') return;
    if (state.uri) install();
    else start(state.update);
  };

  return { state, start, cancel, dismiss, install, retry };
}
