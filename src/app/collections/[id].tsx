import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { getCollection, getCollectionDetail } from '@/api/zhihu';
import { CreationCard } from '@/components/CreationCard';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useRefreshAction } from '@/hooks/useRefreshAction';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import type { ZhihuCollectionItem } from '@/types/zhihu';
import { refreshInfiniteQuery } from '@/utils/query';

export default function CollectionDetailScreen() {
  const colorScheme = useColorScheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const primaryColor = useThemeColor({}, 'primary');
  const borderColor = Colors[colorScheme].border;

  useEffect(() => {
    navigation.setOptions({ title: '收藏夹' });
  }, [navigation]);

  const {
    data: collection,
    isError: collectionError,
    refetch: refetchCollection,
  } = useQuery({
    queryKey: ['collection-detail', id],
    queryFn: () => getCollection(id),
  });

  const {
    data: listData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    refetch,
    isError: contentsError,
  } = useZhihuInfiniteQuery({
    queryKey: ['collection-contents', id],
    queryFn: ({ pageParam = 0 }) =>
      getCollectionDetail(id, 20, pageParam as number),
    initialPageParam: 0,
  });

  const { refresh, refreshing } = useRefreshAction(() =>
    Promise.all([
      refetchCollection(),
      refreshInfiniteQuery(queryClient, ['collection-contents', id]),
    ]),
  );

  const contents =
    listData?.pages
      .flatMap((page) => page.data)
      .filter((item) => item.content) || [];

  return (
    <View className="flex-1">
      <View
        className="p-5"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
      >
        {collectionError ? (
          <QueryErrorView
            compact
            message="收藏夹信息加载失败"
            onRetry={() => void refetchCollection()}
          />
        ) : (
          <>
            <Text className="text-xl font-bold">
              {collection?.collection?.title || '收藏夹内容'}
            </Text>
            {collection?.collection?.description ? (
              <Text type="secondary" className="text-sm mt-2.5 leading-5">
                {collection?.collection?.description}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <FlashList
        data={contents}
        keyExtractor={(item) => `${item.content.type}:${item.content.id}`}
        renderItem={({ item }: { item: ZhihuCollectionItem }) => {
          const content = item.content;
          if (!content) return null;
          const type = content.type === 'zvideo' ? 'video' : content.type;
          if (
            type !== 'answer' &&
            type !== 'article' &&
            type !== 'pin' &&
            type !== 'question' &&
            type !== 'video'
          )
            return null;
          return <CreationCard item={content} type={type} />;
        }}
        {...({ estimatedItemSize: 150 } as object)}
        onEndReached={() => {
          if (hasNextPage && !isFetching) void fetchNextPage();
        }}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
        ListEmptyComponent={() => (
          <View className="px-6 py-16 items-center">
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : contentsError ? (
              <QueryErrorView
                compact
                message="收藏内容加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary">这个收藏夹空空如也喵</Text>
            )}
          </View>
        )}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
          ) : null
        }
      />
    </View>
  );
}
