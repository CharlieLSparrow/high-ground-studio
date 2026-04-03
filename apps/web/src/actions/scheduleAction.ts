export async function createAppointment(data: {
  clientName: string;
  email?: string;
  appointmentDate: string;
  timeSlot: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
}) {
  console.log("Creating appointment:", data);
  
  // For now, just return success
  return { 
    success: true,
    message: "Appointment scheduled successfully!" 
  };
}
