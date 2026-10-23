import { Redirect, useLocalSearchParams } from 'expo-router';

export default function QuestionsAlias() {
  const { id } = useLocalSearchParams();
  return <Redirect href={`/question/${id}`} />;
}
