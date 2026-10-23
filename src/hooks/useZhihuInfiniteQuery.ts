import {
  type DefaultError,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  useInfiniteQuery,
} from '@tanstack/react-query';

/**
 * 知乎列表接口共有的分页结构。getNextPageParam 只读这一部分,
 * 所以调用方的页数据类型只需要满足它。
 */
export interface ZhihuPaginatedPage {
  paging?: {
    is_end?: boolean;
    next?: string;
  };
}

export function getZhihuNextOffset(
  page: ZhihuPaginatedPage,
): number | undefined {
  if (page.paging?.is_end || !page.paging?.next) return undefined;
  try {
    const value = new URL(
      page.paging.next,
      'https://www.zhihu.com',
    ).searchParams.get('offset');
    if (value === null || !/^\d+$/.test(value)) return undefined;
    const offset = Number(value);
    return Number.isSafeInteger(offset) ? offset : undefined;
  } catch {
    return undefined;
  }
}

/**
 * useInfiniteQuery 的知乎特化版本:统一从 paging.next 的 offset 查询参数
 * 推导下一页的 pageParam。除 getNextPageParam 由本 hook 提供外,
 * 其余选项与 useInfiniteQuery 完全一致。
 */
export function useZhihuInfiniteQuery<
  TQueryFnData extends ZhihuPaginatedPage,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: Omit<
    UseInfiniteQueryOptions<
      TQueryFnData,
      TError,
      InfiniteData<TQueryFnData, number>,
      TQueryKey,
      number
    >,
    'getNextPageParam'
  >,
) {
  return useInfiniteQuery({
    ...options,
    getNextPageParam: getZhihuNextOffset,
  });
}
