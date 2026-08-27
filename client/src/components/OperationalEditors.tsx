import { type FormEvent, useState } from "react";
import { Archive, CalendarClock, Info, Save, UserRoundPen, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

const genders = ["Female", "Male", "Other", "Not specified"] as const;
type Patient = { id: number; fullName: string; gender: (typeof genders)[number]; phone: string; careContext: string };
type Clinician = { id: number; fullName: string; specialty: string };
type AppointmentRow = { appointment: { id: number; startsAt: Date; displayName?: string | null; reason: string }; patient: Patient; clinician: Clinician };

export function PatientEditModal({
  patient,
  onClose,
  onNotice,
}: {
  patient: Patient;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState({
    fullName: patient.fullName,
    gender: patient.gender,
    phone: patient.phone,
    careContext: patient.careContext,
  });
  const [confirmArchive, setConfirmArchive] = useState(false);

  const update = trpc.hms.updatePatient.useMutation({
    onSuccess: async () => {
      onNotice("Patient record updated.");
      await utils.hms.overview.invalidate();
      onClose();
    },
    onError: (error) => onNotice(error.message),
  });

  const archive = trpc.hms.archivePatient.useMutation({
    onSuccess: async () => {
      onNotice("Patient registration archived. It can be restored from Archive.");
      await Promise.all([utils.hms.overview.invalidate(), utils.hms.archivedRecords.invalidate()]);
      onClose();
    },
    onError: (error) => onNotice(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate({ patientId: patient.id, ...draft });
  };

  return (
    <Overlay
      title="Edit patient record"
      subtitle="Update registration and care-context details. Clinical records remain role protected."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Full name" value={draft.fullName} onChange={(value) => setDraft({ ...draft, fullName: value })} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#637381]">Gender</span>
            <select
              value={draft.gender}
              onChange={(event) => setDraft({ ...draft, gender: event.target.value as Patient["gender"] })}
              className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] px-3.5 text-xs sm:text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83]"
            >
              {genders.map((gender) => (
                <option key={gender} value={gender}>
                  {gender}
                </option>
              ))}
            </select>
          </label>
          <Input label="Phone" value={draft.phone} onChange={(value) => setDraft({ ...draft, phone: value })} />
        </div>
        <Input
          label="Care context"
          value={draft.careContext}
          onChange={(value) => setDraft({ ...draft, careContext: value })}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row pt-2">
          <button
            type="button"
            onClick={() => setConfirmArchive(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#e9c879] bg-[#fff9e9] px-4 py-3 text-xs sm:text-sm font-extrabold text-[#8a6210] hover:bg-[#fff2d2]"
          >
            <Archive className="h-4 w-4" />
            Archive patient
          </button>
          <div className="flex-1">
            <Submit pending={update.isPending} label="Save patient changes" icon={<UserRoundPen className="h-4 w-4" />} />
          </div>
        </div>
      </form>
      {confirmArchive && (
        <ArchiveConfirmation
          recordType="patient registration"
          recordName={patient.fullName}
          pending={archive.isPending}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => archive.mutate({ patientId: patient.id })}
        />
      )}
    </Overlay>
  );
}

export function AppointmentEditModal({
  row,
  patients,
  clinicians,
  onClose,
  onNotice,
}: {
  row: AppointmentRow;
  patients: Patient[];
  clinicians: Clinician[];
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState({
    patientId: String(row.patient.id),
    clinicianId: String(row.clinician.id),
    startsAt: new Date(row.appointment.startsAt).toISOString().slice(0, 16),
    displayName: row.appointment.displayName ?? "",
    reason: row.appointment.reason,
  });
  const [confirmArchive, setConfirmArchive] = useState(false);

  const update = trpc.hms.updateAppointment.useMutation({
    onSuccess: async () => {
      onNotice("Appointment details updated.");
      await Promise.all([utils.hms.overview.invalidate(), utils.hms.availability.invalidate()]);
      onClose();
    },
    onError: (error) => onNotice(error.message),
  });

  const archive = trpc.hms.archiveAppointment.useMutation({
    onSuccess: async () => {
      onNotice("Appointment archived. It can be restored from Archive.");
      await Promise.all([
        utils.hms.overview.invalidate(),
        utils.hms.availability.invalidate(),
        utils.hms.archivedRecords.invalidate(),
      ]);
      onClose();
    },
    onError: (error) => onNotice(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate({
      appointmentId: row.appointment.id,
      patientId: Number(draft.patientId),
      clinicianId: Number(draft.clinicianId),
      startsAtMs: new Date(draft.startsAt).getTime(),
      displayName: draft.displayName.trim() || undefined,
      reason: draft.reason,
    });
  };

  const title = row.appointment.displayName || row.appointment.reason;

  return (
    <Overlay
      title="Edit appointment"
      subtitle="Reschedule operational details. The system will reject conflicts or times outside published availability."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Select
          label="Patient"
          value={draft.patientId}
          onChange={(value) => setDraft({ ...draft, patientId: value })}
          options={patients.map((patient) => [String(patient.id), patient.fullName])}
        />
        <Select
          label="Clinician"
          value={draft.clinicianId}
          onChange={(value) => setDraft({ ...draft, clinicianId: value })}
          options={clinicians.map((clinician) => [String(clinician.id), `${clinician.fullName} · ${clinician.specialty}`])}
        />
        <label className="block">
          <span className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#637381]">Appointment time</span>
          <input
            required
            type="datetime-local"
            value={draft.startsAt}
            onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
            className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] px-3.5 text-xs sm:text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83]"
          />
        </label>
        <Input
          label="Appointment name (optional)"
          required={false}
          value={draft.displayName}
          onChange={(value) => setDraft({ ...draft, displayName: value })}
        />
        <Input label="Reason" value={draft.reason} onChange={(value) => setDraft({ ...draft, reason: value })} />
        <div className="flex flex-col-reverse gap-3 sm:flex-row pt-2">
          <button
            type="button"
            onClick={() => setConfirmArchive(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#e9c879] bg-[#fff9e9] px-4 py-3 text-xs sm:text-sm font-extrabold text-[#8a6210] hover:bg-[#fff2d2]"
          >
            <Archive className="h-4 w-4" />
            Archive appointment
          </button>
          <div className="flex-1">
            <Submit pending={update.isPending} label="Save appointment" icon={<CalendarClock className="h-4 w-4" />} />
          </div>
        </div>
      </form>
      {confirmArchive && (
        <ArchiveConfirmation
          recordType="appointment"
          recordName={title}
          pending={archive.isPending}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => archive.mutate({ appointmentId: row.appointment.id })}
        />
      )}
    </Overlay>
  );
}

function ArchiveConfirmation({
  recordType,
  recordName,
  pending,
  onCancel,
  onConfirm,
}: {
  recordType: string;
  recordName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#10283a]/60 p-4 backdrop-blur-xs">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-confirm-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[22px] border-t-4 border-t-[#e4b84c] bg-white p-5 sm:p-6 shadow-2xl"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff4d6] text-[#8a6210]">
          <Archive className="h-5 w-5" />
        </div>
        <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#8a6210]">Archive confirmation</p>
        <h3 id="archive-confirm-title" className="mt-1 font-display text-[26px] sm:text-[30px] leading-none text-[#10283a]">
          Archive this {recordType}?
        </h3>
        <p className="mt-2.5 text-xs sm:text-sm leading-6 text-[#526576]">
          You are archiving <strong className="text-[#193448]">{recordName}</strong>. It will disappear from active care operations but remains in recoverable archive.
        </p>
        <div className="mt-4 rounded-xl border border-[#f1ddb0] bg-[#fffaf0] p-3.5 text-xs leading-5 text-[#6c551a]">
          <p className="flex items-center gap-1.5 font-extrabold text-[#8a6210]">
            <Info className="h-4 w-4 shrink-0" />
            Before you continue
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px]">
            <li>Archived records can be recovered from the Archive workspace.</li>
            <li>Billing and clinical history prevents archiving to protect records.</li>
            <li>Restored appointments are rechecked for conflicts.</li>
          </ul>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-xl border border-[#dce7e3] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-[#526576] hover:bg-[#f0f5f1]"
          >
            Keep active
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#9a6b11] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-white shadow-xs hover:bg-[#855b0d] disabled:opacity-50"
          >
            <Archive className="h-4 w-4" />
            {pending ? "Archiving..." : `Archive ${recordType}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function Overlay({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-[#10283a]/50 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[22px] border-t-4 border-t-[#29d0d7] bg-white p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#007c83]">Operational record</p>
            <h2 className="mt-1 font-display text-[26px] sm:text-[30px] text-[#10283a]">{title}</h2>
            <p className="mt-1 text-xs sm:text-sm leading-5 text-[#637381]">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-[#637381] hover:bg-[#f0f5f1]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#637381]">{label}</span>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] px-3.5 text-xs sm:text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83]"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#637381]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3.5 text-xs sm:text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83]"
      >
        {options.map(([id, title]) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}

function Submit({
  pending,
  label,
  icon,
}: {
  pending: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#007c83] px-4 py-3 text-xs sm:text-sm font-extrabold text-white shadow-sm hover:bg-[#006b71] disabled:opacity-50"
    >
      <Save className="h-4 w-4" />
      {icon}
      {pending ? "Saving..." : label}
    </button>
  );
}
