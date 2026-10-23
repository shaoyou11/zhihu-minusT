import { type Href, Redirect } from 'expo-router';

/** Keep old feedback links working after feedback moved into the About page. */
export default function FeedbackRedirect() {
  return <Redirect href={'/about' as Href} />;
}
