import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePaneActive } from '@/features/adaptive-layout/PaneContext';

/** Visible routes may poll only while the application is in the foreground. */
export function useActiveScreen(): boolean {
  const focused = usePaneActive();
  const [state, setState] = useState(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setState);
    return () => subscription.remove();
  }, []);
  return focused && state === 'active';
}
