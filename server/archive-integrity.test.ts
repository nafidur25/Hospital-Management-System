import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveAppointment,
  archivePatient,
  restoreAppointment,
  restorePatient,
  setDb,
} from "./db";

const mockTx = {
  select: vi.fn(),
  update: vi.fn(),
};

const mockDb = {
  transaction: vi.fn((cb: (tx: any) => Promise<any>) => cb(mockTx)),
  select: vi.fn(),
  update: vi.fn(),
};

describe("HMS Archive and Recovery Integrity Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDb(mockDb);
    // Mock ensureHmsSeed check so it sees existing patient and skips seeding
    mockDb.select.mockReturnValue({
      from: () => ({
        limit: () => [{ id: 1 }],
      }),
    });
  });

  describe("archiveAppointment", () => {
    it("rejects archiving an appointment with Completed status", async () => {
      mockTx.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{ id: 10, status: "Completed", patientId: 1, clinicianId: 1 }],
          }),
        }),
      });

      await expect(archiveAppointment({ appointmentId: 10, userId: 99 })).rejects.toThrow(
        "Only Scheduled or Cancelled appointments can be archived."
      );
    });

    it("rejects archiving an appointment with linked clinical notes or bills", async () => {
      // Return Scheduled appointment
      mockTx.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{ id: 10, status: "Scheduled", patientId: 1, clinicianId: 1 }],
          }),
        }),
      });

      // Return 1 linked bill, 0 notes, 0 prescriptions, 0 orders
      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [{ id: 101 }] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) });

      await expect(archiveAppointment({ appointmentId: 10, userId: 99 })).rejects.toThrow(
        "This appointment has linked billing or clinical records and must remain active."
      );
    });

    it("archives an unlinked Scheduled appointment and records archivedByUserId", async () => {
      mockTx.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{ id: 10, status: "Scheduled", patientId: 1, clinicianId: 1 }],
          }),
        }),
      });

      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) });

      const setMock = vi.fn(() => ({ where: vi.fn() }));
      mockTx.update.mockReturnValueOnce({ set: setMock });

      const result = await archiveAppointment({ appointmentId: 10, userId: 99 });
      expect(result.success).toBe(true);
      expect(result.archivedAt).toBeInstanceOf(Date);
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
        archivedByUserId: 99,
        archivedAt: expect.any(Date),
      }));
    });
  });

  describe("archivePatient", () => {
    it("rejects archiving a patient with active appointments", async () => {
      mockTx.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{ id: 5, fullName: "Ayesha Rahman" }],
          }),
        }),
      });

      // 1 active appointment, 0 bills, 0 notes, 0 prescriptions, 0 orders
      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [{ id: 501 }] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) });

      await expect(archivePatient({ patientId: 5, userId: 99 })).rejects.toThrow(
        "This patient has linked scheduling, billing, or clinical records and must remain active."
      );
    });

    it("archives an unlinked patient and sets archivedByUserId", async () => {
      mockTx.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{ id: 5, fullName: "Farhan Siddique" }],
          }),
        }),
      });

      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) });

      const setMock = vi.fn(() => ({ where: vi.fn() }));
      mockTx.update.mockReturnValueOnce({ set: setMock });

      const result = await archivePatient({ patientId: 5, userId: 99 });
      expect(result.success).toBe(true);
      expect(result.archivedAt).toBeInstanceOf(Date);
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
        archivedByUserId: 99,
        archivedAt: expect.any(Date),
      }));
    });
  });

  describe("restorePatient", () => {
    it("clears archivedAt while preserving the archivedByUserId audit trail", async () => {
      mockDb.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{ id: 5, fullName: "Farhan Siddique", archivedAt: new Date(), archivedByUserId: 99 }],
          }),
        }),
      });

      const setMock = vi.fn(() => ({ where: vi.fn() }));
      mockDb.update.mockReturnValueOnce({ set: setMock });

      const result = await restorePatient(5);
      expect(result.success).toBe(true);
      expect(setMock).toHaveBeenCalledWith({ archivedAt: null });
      // archivedByUserId is NOT set to null, preserving audit trail
      expect(setMock).not.toHaveBeenCalledWith(expect.objectContaining({ archivedByUserId: null }));
    });
  });

  describe("restoreAppointment", () => {
    it("rejects restoring an appointment if the linked patient is still archived", async () => {
      // Find archived appointment
      mockTx.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{
              id: 20,
              patientId: 5,
              clinicianId: 1,
              startsAt: new Date("2026-08-27T09:00:00Z"),
              endsAt: new Date("2026-08-27T09:30:00Z"),
              status: "Scheduled",
              archivedAt: new Date(),
            }],
          }),
        }),
      });

      // patient search returns empty (still archived), clinician search returns clinician
      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [{ id: 1, isActive: "yes" }] }) }) });

      await expect(restoreAppointment(20)).rejects.toThrow(
        "Restore the linked patient record before restoring this appointment."
      );
    });

    it("rejects restoring an appointment if the clinician is inactive", async () => {
      mockTx.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{
              id: 20,
              patientId: 5,
              clinicianId: 1,
              startsAt: new Date("2026-08-27T09:00:00Z"),
              endsAt: new Date("2026-08-27T09:30:00Z"),
              status: "Scheduled",
              archivedAt: new Date(),
            }],
          }),
        }),
      });

      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [{ id: 5 }] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [] }) }) }); // inactive clinician

      await expect(restoreAppointment(20)).rejects.toThrow(
        "The appointment clinician is no longer active."
      );
    });

    it("rejects restoring if appointment slot conflicts with an active appointment", async () => {
      const startsAt = new Date("2026-08-27T09:00:00Z");
      const endsAt = new Date("2026-08-27T09:30:00Z");

      mockTx.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{
              id: 20,
              patientId: 5,
              clinicianId: 1,
              startsAt,
              endsAt,
              status: "Scheduled",
              archivedAt: new Date(),
            }],
          }),
        }),
      });

      // patient found, clinician found
      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [{ id: 5 }] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [{ id: 1, isActive: "yes" }] }) }) });

      // weekday availability window found, conflicting active appointment found
      const weekday = startsAt.getUTCDay();
      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => [{ clinicianId: 1, weekday, startMinute: 540, endMinute: 1020, slotMinutes: 30 }] }) })
        .mockReturnValueOnce({ from: () => ({ where: () => [{ id: 99, clinicianId: 1, startsAt, endsAt, status: "Scheduled" }] }) });

      await expect(restoreAppointment(20)).rejects.toThrow(
        "That appointment time was just taken. Choose another open slot."
      );
    });

    it("restores appointment and preserves archivedByUserId audit trail when valid", async () => {
      const startsAt = new Date("2026-08-27T09:00:00Z");
      const endsAt = new Date("2026-08-27T09:30:00Z");

      mockTx.select.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => [{
              id: 20,
              patientId: 5,
              clinicianId: 1,
              startsAt,
              endsAt,
              status: "Scheduled",
              archivedAt: new Date(),
              archivedByUserId: 99,
            }],
          }),
        }),
      });

      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [{ id: 5 }] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => [{ id: 1, isActive: "yes" }] }) }) });

      const weekday = startsAt.getUTCDay();
      mockTx.select
        .mockReturnValueOnce({ from: () => ({ where: () => [{ clinicianId: 1, weekday, startMinute: 540, endMinute: 1020, slotMinutes: 30 }] }) })
        .mockReturnValueOnce({ from: () => ({ where: () => [] }) }); // No conflict

      const setMock = vi.fn(() => ({ where: vi.fn() }));
      mockTx.update.mockReturnValueOnce({ set: setMock });

      const result = await restoreAppointment(20);
      expect(result.success).toBe(true);
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ archivedAt: null }));
    });
  });
});
