import { Redirect, useLocalSearchParams } from 'expo-router';

export default function AnswerAlias() {
  const { id, answerId } = useLocalSearchParams<{
    id: string;
    answerId: string;
  }>();
  return (
    <Redirect
      href={{
        pathname: '/answer/[id]',
        params: { id: answerId, questionId: id },
      }}
    />
  );
}
