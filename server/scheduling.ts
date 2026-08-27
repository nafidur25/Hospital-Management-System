export type AvailabilityWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
};

export type ScheduledRange = {
  startsAt: Date;
  endsAt: Date;
  status: string;
};

export type AvailabilitySlot = {
  startsAt: Date;
  endsAt: Date;
  status: "open" | "booked" | "outside-hours";
};

export function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function atMinuteOnUtcDay(day: Date, minute: number) {
  const start = startOfUtcDay(day);
  return new Date(start.getTime() + minute * 60_000);
}

export function rangesOverlap(startsAt: Date, endsAt: Date, otherStartsAt: Date, otherEndsAt: Date) {
  return startsAt < otherEndsAt && endsAt > otherStartsAt;
}

export function buildAvailabilitySlots(day: Date, windows: AvailabilityWindow[], scheduled: ScheduledRange[]): AvailabilitySlot[] {
  const weekday = day.getUTCDay();
  const todayWindows = windows.filter((window) => window.weekday === weekday);
  const slots: AvailabilitySlot[] = [];

  for (const window of todayWindows) {
    for (let minute = window.startMinute; minute + window.slotMinutes <= window.endMinute; minute += window.slotMinutes) {
      const startsAt = atMinuteOnUtcDay(day, minute);
      const endsAt = atMinuteOnUtcDay(day, minute + window.slotMinutes);
      const booked = scheduled.some((appointment) => appointment.status !== "Cancelled" && rangesOverlap(startsAt, endsAt, appointment.startsAt, appointment.endsAt));
      slots.push({ startsAt, endsAt, status: booked ? "booked" : "open" });
    }
  }

  return slots;
}

export function validateBookingRequest(startsAt: Date, endsAt: Date, windows: AvailabilityWindow[], scheduled: ScheduledRange[]) {
  const weekday = startsAt.getUTCDay();
  const startsAtMinute = startsAt.getUTCHours() * 60 + startsAt.getUTCMinutes();
  const endsAtMinute = endsAt.getUTCHours() * 60 + endsAt.getUTCMinutes();
  const insidePublishedWindow = windows.some((window) => window.weekday === weekday && startsAtMinute >= window.startMinute && endsAtMinute <= window.endMinute);
  if (!insidePublishedWindow) throw new Error("The selected time is outside this clinician's availability.");
  const hasConflict = scheduled.some((appointment) => appointment.status !== "Cancelled" && rangesOverlap(startsAt, endsAt, appointment.startsAt, appointment.endsAt));
  if (hasConflict) throw new Error("That appointment time was just taken. Choose another open slot.");
}
