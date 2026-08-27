import { ArchiveRestore, CalendarClock, Loader2, RotateCcw, UsersRound } from "lucide-react";
import { trpc } from "@/lib/trpc";

const formatDate = (value: Date | null) => (value ? new Date(value).toLocaleString() : "Unknown time");

export function ArchiveManagement({ onNotice }: { onNotice: (message: string) => void }) {
  const utils = trpc.useUtils();
  const archived = trpc.hms.archivedRecords.useQuery();

  const restorePatient = trpc.hms.restorePatient.useMutation({
    onSuccess: async () => {
      onNotice("Patient registration restored to the active registry.");
      await Promise.all([utils.hms.archivedRecords.invalidate(), utils.hms.overview.invalidate()]);
    },
    onError: (error) => onNotice(error.message),
  });

  const restoreAppointment = trpc.hms.restoreAppointment.useMutation({
    onSuccess: async () => {
      onNotice("Appointment restored after availability validation.");
      await Promise.all([
        utils.hms.archivedRecords.invalidate(),
        utils.hms.overview.invalidate(),
        utils.hms.availability.invalidate(),
      ]);
    },
    onError: (error) => onNotice(error.message),
  });

  if (archived.isLoading) {
    return (
      <div className="grid min-h-[400px] place-items-center rounded-[20px] border border-dashed border-[#c9dfdc] bg-white p-6">
        <p className="flex items-center gap-2 text-sm font-bold text-[#526576]">
          <Loader2 className="h-4 w-4 animate-spin text-[#007c83]" />
          Loading recoverable records...
        </p>
      </div>
    );
  }

  const patients = archived.data?.patients ?? [];
  const appointments = archived.data?.appointments ?? [];

  return (
    <section className="space-y-6 sm:space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#8a6210]">Recoverable records</p>
          <h2 className="mt-1 font-display text-[28px] sm:text-[32px] leading-none text-[#10283a]">Archive and recovery</h2>
          <p className="mt-2 max-w-2xl text-xs sm:text-sm leading-5 sm:leading-6 text-[#637381]">
            Archived records are removed from active operations, not permanently deleted. Restoring an appointment rechecks current scheduling availability.
          </p>
        </div>
        <div className="rounded-xl border border-[#f0ddac] bg-[#fff9e9] px-4 py-2.5 text-xs sm:text-sm font-bold text-[#80601b]">
          <span className="font-mono text-base font-extrabold text-[#8a6210]">{patients.length + appointments.length}</span>{" "}
          recoverable records
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ArchivePanel
          title="Archived patient registrations"
          icon={<UsersRound className="h-5 w-5" />}
          empty="No patient registrations are currently archived."
        >
          {patients.map(({ patient, archivedBy }) => (
            <article key={patient.id} className="rounded-2xl border border-[#ebe4d3] bg-[#fffefb] p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-[#193448]">{patient.fullName}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#82909a]">
                    {patient.patientCode} · {patient.phone}
                  </p>
                </div>
                <button
                  disabled={restorePatient.isPending}
                  onClick={() => restorePatient.mutate({ patientId: patient.id })}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#007c83] px-3 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-[#006b71] disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#637381]">
                Archived {formatDate(patient.archivedAt)}
                {archivedBy?.name ? ` by ${archivedBy.name}` : ""}. Restoring returns this registration to the active patient directory.
              </p>
            </article>
          ))}
        </ArchivePanel>

        <ArchivePanel
          title="Archived appointments"
          icon={<CalendarClock className="h-5 w-5" />}
          empty="No appointments are currently archived."
        >
          {appointments.map(({ appointment, patient, clinician, archivedBy }) => (
            <article key={appointment.id} className="rounded-2xl border border-[#ebe4d3] bg-[#fffefb] p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-[#193448]">{appointment.displayName || appointment.reason}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[#526576]">
                    {patient.fullName} · {clinician.fullName}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#82909a]">
                    {new Date(appointment.startsAt).toLocaleString()}
                  </p>
                </div>
                <button
                  disabled={restoreAppointment.isPending}
                  onClick={() => restoreAppointment.mutate({ appointmentId: appointment.id })}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#007c83] px-3 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-[#006b71] disabled:opacity-50"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  Restore
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#637381]">
                Archived {formatDate(appointment.archivedAt)}
                {archivedBy?.name ? ` by ${archivedBy.name}` : ""}. Restoring verifies the linked patient, clinician availability, and booking conflicts.
              </p>
            </article>
          ))}
        </ArchivePanel>
      </div>
    </section>
  );
}

function ArchivePanel({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="rounded-[20px] border border-[#e2e8e2] bg-white p-5 sm:p-6 shadow-xs">
      <div className="flex items-center gap-3 text-[#8a6210]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff4d6]">{icon}</span>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em]">Archive</p>
          <h3 className="mt-0.5 font-display text-[22px] sm:text-[25px] text-[#10283a]">{title}</h3>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {children.length ? (
          children
        ) : (
          <div className="rounded-xl border border-dashed border-[#dfe6df] bg-[#fbfcfa] p-6 text-xs sm:text-sm text-[#637381]">
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}
