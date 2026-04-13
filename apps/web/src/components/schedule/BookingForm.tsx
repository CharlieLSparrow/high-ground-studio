"use client";

import { useState } from "react";
import DatePicker from "react-datepicker";
import { createAppointment } from "@/actions/scheduleAction";
import "react-datepicker/dist/react-datepicker.css";

const morningTimes = ["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM"];
const afternoonTimes = ["1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];

export default function BookingForm() {
  // 1. Explicitly allow Date | null to satisfy react-datepicker
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Guard clause: Don't submit if we are missing the core pieces
    if (!selectedDate || !selectedTime || !clientName) return;

    setIsSubmitting(true);

    // Assemble the clean payload at the exact moment of submission
    const appointmentPayload = {
      clientName,
      email,
      // Send the date as a clean ISO string, let the server handle the timezone math
      date: selectedDate.toISOString(), 
      time: selectedTime,
    };

    try {
      await createAppointment(appointmentPayload);
      // TODO for later: Add a success toast or redirect here
      alert("Appointment requested!");
    } catch (error) {
      console.error("Failed to book:", error);
      alert("Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-2xl mx-auto text-black">
      <h2 className="text-xl font-semibold mb-6">Book an Appointment</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Left Column: User Details & Date */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="clientName">
                Client Name
              </label>
              <input
                type="text"
                id="clientName"
                className="w-full px-3 py-2 border rounded-md"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="email">
                Email
              </label>
              <input
                type="email"
                id="email"
                className="w-full px-3 py-2 border rounded-md"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Select Date
              </label>
              <DatePicker
                selected={selectedDate}
                onChange={(date: Date | null) => setSelectedDate(date)}
                minDate={new Date()}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>

          {/* Right Column: Time Slots */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Select Time
            </label>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm text-gray-500 mb-2">Morning</h3>
                <div className="grid grid-cols-2 gap-2">
                  {morningTimes.map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setSelectedTime(time)}
                      className={`p-2 text-sm rounded-md transition-colors ${
                        selectedTime === time 
                          ? "bg-blue-600 text-white shadow-sm" 
                          : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm text-gray-500 mb-2">Afternoon</h3>
                <div className="grid grid-cols-2 gap-2">
                  {afternoonTimes.map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setSelectedTime(time)}
                      className={`p-2 text-sm rounded-md transition-colors ${
                        selectedTime === time 
                          ? "bg-blue-600 text-white shadow-sm" 
                          : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
        </div>

        <button
          type="submit"
          disabled={!clientName || !selectedTime || !selectedDate || isSubmitting}
          className="w-full mt-6 bg-blue-600 text-white font-medium py-3 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Booking..." : "Confirm Appointment"}
        </button>
      </form>
    </div>
  );
}