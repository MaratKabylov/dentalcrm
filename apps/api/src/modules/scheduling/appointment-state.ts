import type { AppointmentStatus } from "@dental/contracts";

const transitions: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  created: ["awaiting_confirmation", "confirmed", "cancelled", "rescheduled"],
  awaiting_confirmation: ["confirmed", "cancelled", "rescheduled"],
  confirmed: ["checked_in", "cancelled", "no_show", "rescheduled"],
  checked_in: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [], cancelled: [], no_show: [], rescheduled: []
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return transitions[from].includes(to);
}
