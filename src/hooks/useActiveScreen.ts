import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Visible routes may poll only while the application is in the foreground. */
export function useActiveScreen(): boolean {
  const focused = useIsFocused();
  const [state, setState] = useState(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setState);
    return () => subscription.remove();
  }, []);
  return focused && state === 'active';
}
