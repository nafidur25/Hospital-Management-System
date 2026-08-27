import { type FormEvent, useEffect, useState } from "react";
import { ClipboardPlus, FilePlus2, FlaskConical, Loader2, Pill, Plus, Stethoscope, X } from "lucide-react";
import { hasHmsPermission, type HmsRole } from "../../../shared/hmsAccess";
import { trpc } from "@/lib/trpc";

type Patient = { id: number; fullName: string; patientCode: string; careContext: string };
type Clinician = { id: number; fullName: string; specialty: string };
type MedicalRecordsProps = { patients: Patient[]; clinicians: Clinician[]; role: HmsRole; onNotice: (message: string) => void };
type FormMode = "note" | "prescription" | "lab" | "result" | null;

export function MedicalRecords({ patients, clinicians, role, onNotice }: MedicalRecordsProps) {
  const [patientId, setPatientId] = useState<number | null>(null);
  const [clinicianId, setClinicianId] = useState<number | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!patientId && patients[0]) setPatientId(patients[0].id);
  }, [patientId, patients]);

  useEffect(() => {
    if (!clinicianId && clinicians[0]) setClinicianId(clinicians[0].id);
  }, [clinicianId, clinicians]);

  const record = trpc.hms.getMedicalRecord.useQuery(
    { patientId: patientId ?? 1 },
    { enabled: Boolean(patientId), refetchOnWindowFocus: true }
  );

  const writable = hasHmsPermission(role, "clinicalNoteWrite");
  const selectedPatient = patients.find((patient) => patient.id === patientId);
  const clinicianPayload = role === "admin" ? { clinicianId: clinicianId ?? undefined } : {};

  const refresh = async (message: string) => {
    setMode(null);
    onNotice(message);
    await utils.hms.getMedicalRecord.invalidate();
  };

  const addNote = trpc.hms.createClinicalNote.useMutation({
    onSuccess: () => refresh("Clinical note saved to the patient record."),
    onError: (error) => onNotice(error.message),
  });

  const addPrescription = trpc.hms.createPrescription.useMutation({
    onSuccess: () => refresh("Prescription saved with its medication item."),
    onError: (error) => onNotice(error.message),
  });

  const addLabOrder = trpc.hms.createLaboratoryOrder.useMutation({
    onSuccess: () => refresh("Laboratory order created for this patient."),
    onError: (error) => onNotice(error.message),
  });

  const addLabResult = trpc.hms.recordLaboratoryResult.useMutation({
    onSuccess: () => refresh("Laboratory result recorded and order marked resulted."),
    onError: (error) => onNotice(error.message),
  });

  const submitNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (patientId) {
      addNote.mutate({
        patientId,
        subjective: String(form.get("subjective")),
        assessment: String(form.get("assessment")),
        plan: String(form.get("plan")),
        ...clinicianPayload,
      });
    }
  };

  const submitPrescription = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (patientId) {
      addPrescription.mutate({
        patientId,
        notes: String(form.get("notes") || ""),
        items: [
          {
            medicineName: String(form.get("medicine")),
            dosage: String(form.get("dosage")),
            route: String(form.get("route")),
            frequency: String(form.get("frequency")),
            durationDays: Number(form.get("duration") || 0) || undefined,
            instructions: String(form.get("instructions") || ""),
          },
        ],
        ...clinicianPayload,
      });
    }
  };

  const submitLabOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (patientId) {
      addLabOrder.mutate({
        patientId,
        testName: String(form.get("testName")),
        priority: String(form.get("priority")) as "Routine" | "Urgent",
        clinicalQuestion: String(form.get("clinicalQuestion") || ""),
        ...clinicianPayload,
      });
    }
  };

  const submitResult = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addLabResult.mutate({
      laboratoryOrderId: Number(form.get("orderId")),
      resultSummary: String(form.get("summary")),
      resultValue: String(form.get("value") || ""),
      referenceRange: String(form.get("range") || ""),
      ...clinicianPayload,
    });
  };

  return (
    <section className="space-y-6 sm:space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#007c83]">
            Longitudinal care record
          </p>
          <h2 className="mt-1 font-display text-[28px] sm:text-[32px] leading-none text-[#10283a]">
            Patient medical records
          </h2>
          <p className="mt-2 max-w-2xl text-xs sm:text-sm leading-5 sm:leading-6 text-[#637381]">
            Clinical notes, prescriptions, and laboratory evidence are recorded against a single protected patient timeline.
          </p>
        </div>
        {writable && (
          <div className="flex flex-wrap gap-2">
            <ActionButton icon={<ClipboardPlus className="h-4 w-4" />} onClick={() => setMode("note")}>
              Clinical note
            </ActionButton>
            <ActionButton icon={<Pill className="h-4 w-4" />} onClick={() => setMode("prescription")}>
              Prescription
            </ActionButton>
            <ActionButton icon={<FlaskConical className="h-4 w-4" />} onClick={() => setMode("lab")}>
              Lab order
            </ActionButton>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[.85fr_1.75fr]">
        {/* Patient Selector Card */}
        <aside className="rounded-[20px] border border-[#e2e8e2] bg-white p-5 sm:p-6 shadow-xs">
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#007c83]">Patient file</p>
          <select
            value={patientId ?? ""}
            onChange={(event) => setPatientId(Number(event.target.value))}
            className="mt-2.5 h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3.5 text-xs sm:text-sm font-bold text-[#193448] outline-none focus:border-[#007c83] focus:ring-2 focus:ring-[#8ccdd0]"
          >
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.fullName} · {patient.patientCode}
              </option>
            ))}
          </select>

          {role === "admin" && (
            <label className="mt-4 block">
              <span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#7a8993]">
                Responsible clinician
              </span>
              <select
                value={clinicianId ?? ""}
                onChange={(event) => setClinicianId(Number(event.target.value))}
                className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3.5 text-xs sm:text-sm font-bold text-[#193448] outline-none focus:border-[#007c83] focus:ring-2 focus:ring-[#8ccdd0]"
              >
                {clinicians.map((clinician) => (
                  <option key={clinician.id} value={clinician.id}>
                    {clinician.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-5 rounded-xl bg-[#e8f4f4] p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#007c83]">Care context</p>
            <p className="mt-1.5 text-xs sm:text-sm font-bold text-[#193448]">
              {selectedPatient?.careContext || "Loading patient record"}
            </p>
            <p className="mt-2.5 text-xs text-[#526576]">
              Role: <strong className="capitalize text-[#007c83]">{role}</strong>
            </p>
          </div>

          {!writable && (
            <div className="mt-4 rounded-xl border border-[#f0ddae] bg-[#fff8e8] p-3.5 text-xs leading-5 text-[#8a6417]">
              Reception staff can view patient scheduling data but do not have access to clinical documentation.
            </div>
          )}
        </aside>

        {/* Timeline Records */}
        <div className="space-y-5">
          {record.isLoading ? (
            <LoadingRecord />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <RecordStat
                  label="Clinical notes"
                  value={String(record.data?.notes.length ?? 0)}
                  icon={<Stethoscope className="h-5 w-5" />}
                />
                <RecordStat
                  label="Active prescriptions"
                  value={String(
                    record.data?.prescriptions.filter((row) => row.prescription.status === "Active").length ?? 0
                  )}
                  icon={<Pill className="h-5 w-5" />}
                />
                <RecordStat
                  label="Laboratory orders"
                  value={String(record.data?.laboratoryOrders.length ?? 0)}
                  icon={<FlaskConical className="h-5 w-5" />}
                />
              </div>

              {/* Notes Panel */}
              <RecordPanel title="Clinical notes" icon={<Stethoscope className="h-4 w-4" />}>
                {record.data?.notes.length ? (
                  record.data.notes.map(({ note, clinician }) => (
                    <article key={note.id} className="border-b border-[#edf0ed] py-4 last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-extrabold text-[#193448]">{clinician.fullName}</p>
                        <p className="font-mono text-[10px] text-[#7a8993]">{new Date(note.createdAt).toLocaleString()}</p>
                      </div>
                      <p className="mt-2.5 text-xs sm:text-sm leading-6 text-[#526576]">
                        <strong className="text-[#193448]">Assessment:</strong> {note.assessment}
                      </p>
                      <p className="mt-1.5 text-xs sm:text-sm leading-6 text-[#526576]">
                        <strong className="text-[#193448]">Plan:</strong> {note.plan}
                      </p>
                    </article>
                  ))
                ) : (
                  <Empty label="No clinical notes are recorded yet." />
                )}
              </RecordPanel>

              {/* Prescriptions Panel */}
              <RecordPanel title="Prescriptions" icon={<Pill className="h-4 w-4" />}>
                {record.data?.prescriptions.length ? (
                  record.data.prescriptions.map(({ prescription, clinician, items }) => (
                    <article key={prescription.id} className="border-b border-[#edf0ed] py-4 last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-[#193448]">
                            {prescription.prescriptionCode} · {clinician.fullName}
                          </p>
                          <p className="mt-0.5 text-xs text-[#637381]">
                            {prescription.notes || "No additional instruction."}
                          </p>
                        </div>
                        <Status value={prescription.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {items.map((item) => (
                          <div key={item.id} className="rounded-xl bg-[#f7faf8] p-3 text-xs sm:text-sm">
                            <p className="font-extrabold text-[#193448]">
                              {item.medicineName} · {item.dosage}
                            </p>
                            <p className="mt-0.5 text-xs text-[#637381]">
                              {item.frequency} · {item.route}
                              {item.durationDays ? ` · ${item.durationDays} days` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty label="No prescriptions are recorded yet." />
                )}
              </RecordPanel>

              {/* Lab Orders Panel */}
              <RecordPanel title="Laboratory orders and results" icon={<FlaskConical className="h-4 w-4" />}>
                {record.data?.laboratoryOrders.length ? (
                  record.data.laboratoryOrders.map(({ order, orderingClinician, result }) => (
                    <article key={order.id} className="border-b border-[#edf0ed] py-4 last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-[#193448]">{order.testName}</p>
                          <p className="mt-0.5 text-xs text-[#637381]">
                            {order.orderCode} · {orderingClinician.fullName}
                          </p>
                        </div>
                        <Status value={order.status} />
                      </div>
                      {result ? (
                        <div className="mt-2.5 rounded-xl bg-[#e8f4f4] p-3 text-xs sm:text-sm leading-6 text-[#284e5a]">
                          <strong>Result:</strong> {result.resultSummary}
                          {result.resultValue ? ` · ${result.resultValue}` : ""}
                        </div>
                      ) : writable ? (
                        <button
                          onClick={() => setMode("result")}
                          className="mt-2.5 text-xs font-extrabold text-[#007c83] hover:underline"
                        >
                          Record result for this order →
                        </button>
                      ) : (
                        <p className="mt-2 text-xs text-[#82909a]">Awaiting clinical result.</p>
                      )}
                    </article>
                  ))
                ) : (
                  <Empty label="No laboratory orders are recorded yet." />
                )}
              </RecordPanel>
            </>
          )}
        </div>
      </div>

      {/* Modal Actions */}
      {mode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#10283a]/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[22px] border-t-4 border-t-[#29d0d7] bg-white p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#007c83]">
                  Protected record action
                </p>
                <h3 className="mt-1 font-display text-[24px] sm:text-[28px] text-[#10283a]">
                  {mode === "note"
                    ? "Add clinical note"
                    : mode === "prescription"
                    ? "Create prescription"
                    : mode === "lab"
                    ? "Order laboratory test"
                    : "Record laboratory result"}
                </h3>
              </div>
              <button onClick={() => setMode(null)} className="rounded-lg p-2 text-[#637381] hover:bg-[#f0f5f1]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {mode === "note" && (
              <form onSubmit={submitNote} className="mt-5 space-y-4">
                <TextArea name="subjective" label="Subjective" placeholder="Patient report and symptoms" />
                <TextArea name="assessment" label="Assessment" placeholder="Clinical assessment" />
                <TextArea name="plan" label="Plan" placeholder="Follow-up plan and care instructions" />
                <Submit label={addNote.isPending ? "Saving..." : "Save clinical note"} />
              </form>
            )}

            {mode === "prescription" && (
              <form onSubmit={submitPrescription} className="mt-5 space-y-4">
                <Input name="medicine" label="Medicine" placeholder="e.g., Amlodipine" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input name="dosage" label="Dosage" placeholder="5 mg" />
                  <Input name="frequency" label="Frequency" placeholder="Once daily" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input name="route" label="Route" placeholder="Oral" defaultValue="Oral" />
                  <Input name="duration" label="Duration (days)" placeholder="30" type="number" />
                </div>
                <TextArea name="instructions" label="Instructions" placeholder="Take in the morning." optional />
                <TextArea name="notes" label="Prescription notes" placeholder="Additional patient guidance" optional />
                <Submit label={addPrescription.isPending ? "Saving..." : "Save prescription"} />
              </form>
            )}

            {mode === "lab" && (
              <form onSubmit={submitLabOrder} className="mt-5 space-y-4">
                <Input name="testName" label="Test name" placeholder="e.g., Lipid profile" />
                <label className="block">
                  <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">
                    Priority
                  </span>
                  <select
                    name="priority"
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] px-3.5 text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83]"
                  >
                    <option>Routine</option>
                    <option>Urgent</option>
                  </select>
                </label>
                <TextArea
                  name="clinicalQuestion"
                  label="Clinical question"
                  placeholder="What should this test clarify?"
                  optional
                />
                <Submit label={addLabOrder.isPending ? "Saving..." : "Create laboratory order"} />
              </form>
            )}

            {mode === "result" && (
              <form onSubmit={submitResult} className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">Order</span>
                  <select
                    name="orderId"
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] px-3.5 text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83]"
                  >
                    {record.data?.laboratoryOrders
                      .filter(({ result }) => !result)
                      .map(({ order }) => (
                        <option key={order.id} value={order.id}>
                          {order.orderCode} · {order.testName}
                        </option>
                      ))}
                  </select>
                </label>
                <TextArea name="summary" label="Result summary" placeholder="Clinical laboratory interpretation" />
                <Input name="value" label="Result value" placeholder="e.g., Available" optional />
                <Input name="range" label="Reference range" placeholder="e.g., Laboratory reference interval" optional />
                <Submit label={addLabResult.isPending ? "Saving..." : "Record laboratory result"} />
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ActionButton({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-[#007c83] px-3 sm:px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm font-extrabold text-white shadow-sm hover:bg-[#006b71]"
    >
      <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      {icon}
      <span>{children}</span>
    </button>
  );
}

function RecordStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-[#e2e8e2] bg-white p-4 sm:p-5 shadow-xs">
      <div className="text-[#007c83]">{icon}</div>
      <p className="mt-3 font-display text-[26px] sm:text-[30px] leading-none text-[#10283a]">{value}</p>
      <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">{label}</p>
    </div>
  );
}

function RecordPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-[#e2e8e2] bg-white p-5 sm:p-6 shadow-xs">
      <div className="flex items-center gap-2 text-[#007c83]">
        {icon}
        <h3 className="font-display text-[20px] sm:text-[24px] text-[#10283a]">{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Status({ value }: { value: string }) {
  const tone =
    value === "Resulted" || value === "Active"
      ? "bg-[#eaf5ef] text-[#297353]"
      : value === "Urgent"
      ? "bg-[#fff0ee] text-[#ae493d]"
      : "bg-[#e8f4f4] text-[#007c83]";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] ${tone}`}>
      {value}
    </span>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="rounded-xl bg-[#f7faf8] p-4 text-xs sm:text-sm text-[#82909a]">{label}</p>;
}

function Input({
  name,
  label,
  placeholder,
  type = "text",
  defaultValue,
  optional = false,
}: {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
  defaultValue?: string;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">
        {label} {optional && <span className="text-[#96a29b]">(optional)</span>}
      </span>
      <input
        required={!optional}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] px-3.5 text-xs sm:text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83] focus:ring-2 focus:ring-[#8ccdd0]"
      />
    </label>
  );
}

function TextArea({
  name,
  label,
  placeholder,
  optional = false,
}: {
  name: string;
  label: string;
  placeholder: string;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">
        {label} {optional && <span className="text-[#96a29b]">(optional)</span>}
      </span>
      <textarea
        required={!optional}
        name={name}
        placeholder={placeholder}
        className="mt-1.5 min-h-20 sm:min-h-24 w-full rounded-xl border border-[#dfe7e1] p-3 text-xs sm:text-sm leading-6 text-[#193448] outline-none focus:border-[#007c83] focus:ring-2 focus:ring-[#8ccdd0]"
      />
    </label>
  );
}

function Submit({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#007c83] px-4 py-3 text-xs sm:text-sm font-extrabold text-white shadow-sm hover:bg-[#006b71]"
    >
      <FilePlus2 className="h-4 w-4" />
      {label}
    </button>
  );
}

function LoadingRecord() {
  return (
    <div className="grid min-h-64 place-items-center rounded-[20px] border border-dashed border-[#c9dfdc] bg-white p-6 text-xs sm:text-sm font-bold text-[#637381]">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-[#007c83]" />
        Loading protected patient record...
      </div>
    </div>
  );
}
