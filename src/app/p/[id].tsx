import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ArticleAlias() {
  const { id } = useLocalSearchParams();
  return <Redirect href={`/article/${id}`} />;
}
