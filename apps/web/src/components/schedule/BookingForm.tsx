"use client";
import { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const timeOptions = {
  morning: Array.from({ length: 4 }, (_, i) => ({
    label: `${9 + i}:00 AM`,
    value: `2023-10-${new Date().getDate()}-${9 + i}:00:00`
  })),
  afternoon: Array.from({ length: 4 }, (_, i) => ({
    label: `${1 + i}:00 PM`,
    value: `2023-10-${new Date().getDate()}-${1 + i + 12}:00:00`
  }))
};

export default function BookingForm() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("");
  const [formData, setFormData] = useState({
    clientName: "",
    email: "",
    appointmentDate: "",
    timeSlot: selectedTimeSlot,
    status: "PENDING"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAppointment(formData);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-6">Book an Appointment</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" htmlFor="clientName">
              Client Name
            </label>
            <input
              type="text"
              id="clientName"
              className="w-full px-3 py-2 border rounded-md"
              value={formData.clientName}
              onChange={(e) => setFormData({...formData, clientName: e.target.value})}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" htmlFor="email">
              Email
            </label>
            <input
              type="email"
              id="email"
              className="w-full px-3 py-2 border rounded-md"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" htmlFor="appointmentDate">
              Select Date
            </label>
            <DatePicker
              selected={selectedDate}
              onChange={(date: Date) => setSelectedDate(date)}
              minDate={new Date()}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Select Time
            </label>
            
            <div className="space-y-2">
              <h3 className="font-medium">Morning (9:00 AM - 12:00 PM)</h3>
              <div className="grid grid-cols-4 gap-2">
                {timeOptions.morning.map((time) => (
                  <button
                    key={time.value}
                    type="button"
                    onClick={() => setSelectedTimeSlot(time.value)}
                    className={`w-full p-2 rounded-md ${selectedTimeSlot === time.value 
                      ? "bg-blue-500 text-white" 
                      : "bg-gray-100 hover:bg-gray-200"}`}
                  >
                    {time.label}
                  </button>
                ))}
              </div>

              <h3 className="font-medium mt-4">Afternoon (1:00 PM - 4:00 PM)</h3>
              <div className="grid grid-cols-4 gap-2">
                {timeOptions.afternoon.map((time) => (
                  <button
                    key={time.value}
                    type="button"
                    onClick={() => setSelectedTimeSlot(time.value)}
                    className={`w-full p-2 rounded-md ${selectedTimeSlot === time.value 
                      ? "bg-blue-500 text-white" 
                      : "bg-gray-100 hover:bg-gray-200"}`}
                  >
                    {time.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full mt-4 bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-300"
          disabled={!formData.clientName || !selectedTimeSlot}
        >
          Book Appointment
        </button>
      </form>
    </div>
  );
}
