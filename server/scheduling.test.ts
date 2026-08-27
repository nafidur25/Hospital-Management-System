import { describe, expect, it } from "vitest";
import { buildAvailabilitySlots, rangesOverlap, validateBookingRequest } from "./scheduling";

describe("appointment availability", () => {
  it("marks an overlapping clinician slot as booked while keeping adjacent slots open", () => {
    const day = new Date(Date.UTC(2026, 7, 26));
    const slots = buildAvailabilitySlots(day, [{ weekday: 3, startMinute: 540, endMinute: 630, slotMinutes: 30 }], [{ startsAt: new Date(Date.UTC(2026, 7, 26, 9, 30)), endsAt: new Date(Date.UTC(2026, 7, 26, 10, 0)), status: "Scheduled" }]);
    expect(slots.map((slot) => slot.status)).toEqual(["open", "booked", "open"]);
  });

  it("treats intersecting appointment ranges as conflicts", () => {
    const start = new Date(Date.UTC(2026, 7, 26, 9, 0));
    const end = new Date(Date.UTC(2026, 7, 26, 9, 30));
    expect(rangesOverlap(start, end, new Date(Date.UTC(2026, 7, 26, 9, 15)), new Date(Date.UTC(2026, 7, 26, 9, 45)))).toBe(true);
    expect(rangesOverlap(start, end, new Date(Date.UTC(2026, 7, 26, 9, 30)), new Date(Date.UTC(2026, 7, 26, 10, 0)))).toBe(false);
  });

  it("rejects a booking that conflicts with a scheduled visit", () => {
    const startsAt = new Date(Date.UTC(2026, 7, 26, 9, 0));
    const endsAt = new Date(Date.UTC(2026, 7, 26, 9, 30));
    const windows = [{ weekday: 3, startMinute: 540, endMinute: 1020, slotMinutes: 30 }];
    const scheduled = [{ startsAt, endsAt, status: "Scheduled" }];
    expect(() => validateBookingRequest(startsAt, endsAt, windows, scheduled)).toThrow("just taken");
  });

  it("rejects a booking outside the clinician's published hours", () => {
    const startsAt = new Date(Date.UTC(2026, 7, 26, 8, 30));
    const endsAt = new Date(Date.UTC(2026, 7, 26, 9, 0));
    const windows = [{ weekday: 3, startMinute: 540, endMinute: 1020, slotMinutes: 30 }];
    expect(() => validateBookingRequest(startsAt, endsAt, windows, [])).toThrow("outside this clinician's availability");
  });
});
