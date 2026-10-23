import { Redirect, useLocalSearchParams } from 'expo-router';

export default function PeopleAlias() {
  const { id } = useLocalSearchParams();
  return <Redirect href={`/user/${id}`} />;
}
