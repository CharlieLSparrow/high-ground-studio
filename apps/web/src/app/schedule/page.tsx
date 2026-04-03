import { useSession } from "next-auth/react";
import BookingForm from "@/components/schedule/BookingForm";
import AuthButtons from "@/components/site/AuthButtons";

export default async function SchedulePage() {
  const session = await useSession();

  if (!session.data) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h2 className="text-xl font-bold mb-4">Please Log In</h2>
        <AuthButtons />
      </div>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Homer Scheduling Protocol</h1>
      <BookingForm />
    </main>
  );
}
