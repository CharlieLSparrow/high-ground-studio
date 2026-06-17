import { redirect } from 'next/navigation';

export default function CreatorRedirect() {
  // Redirect to home until the creator landing page is fully built.
  redirect('/');
}
