import { type Href, useRouter } from 'expo-router';
import { createContext, useContext, useMemo } from 'react';
import { PaneContext } from './PaneContext';

export const PaneSelectionContext = createContext<
  ((sourceKey: string, href: Href) => boolean) | null
>(null);

/** List clicks can select a detail slot; links from a detail keep normal navigation. */
export function usePaneRouter(): ReturnType<typeof useRouter> {
  const base = useRouter();
  const selector = useContext(PaneSelectionContext);
  const sourceKey = useContext(PaneContext)?.routeKey;
  return useMemo(() => {
    if (!selector || !sourceKey) return base;
    const push: typeof base.push = (...args) => {
      const [href, options] = args;
      if (
        (!options || Object.keys(options).length === 0) &&
        selector(sourceKey, href)
      )
        return;
      base.push(...args);
    };
    return { ...base, push };
  }, [base, selector, sourceKey]);
}
