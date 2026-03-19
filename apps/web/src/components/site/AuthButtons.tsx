import { auth } from "@/auth";
import AuthButtonsClient from "@/components/site/AuthButtonsClient";

export default async function AuthButtons() {
  const session = await auth();
  return <AuthButtonsClient session={session} />;
}