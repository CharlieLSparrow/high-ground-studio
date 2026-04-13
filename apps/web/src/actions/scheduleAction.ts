"use server";

// Match the exact payload we are sending from BookingForm.tsx
interface AppointmentPayload {
  clientName: string;
  email: string;
  date: string;
  time: string;
}

export async function createAppointment(data: AppointmentPayload) {
  // We will wire this up to Prisma later. 
  // For now, just log it to the server console to prove the pipe works.
  console.log("Appointment requested:", data);
  
  return { success: true };
}