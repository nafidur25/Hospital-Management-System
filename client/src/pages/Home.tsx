import { useAuth } from "@/_core/hooks/useAuth";
import React from "react";
import { BookingCalendar } from "@/components/BookingCalendar";
import { AccountManagement } from "@/components/AccountManagement";
import { ArchiveManagement } from "@/components/ArchiveManagement";
import DashboardLayout from "@/components/DashboardLayout";
import { MedicalRecords } from "@/components/MedicalRecords";
import { AppointmentEditModal, PatientEditModal } from "@/components/OperationalEditors";
import { trpc } from "@/lib/trpc";
import { canAccessHmsPage, hasHmsPermission, type HmsPermission, type HmsRole } from "../../../shared/hmsAccess";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  PencilLine,
  ReceiptText,
  Search,
  Settings2,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";

type Page = "Overview" | "Patients" | "Appointments" | "Clinical" | "Pharmacy & Lab" | "Billing" | "Archive" | "Reports";
type NavItem = { label: Page; icon: typeof LayoutDashboard; permission?: HmsPermission };

const logoUrl = "/manus-storage/hms-clinical-ledger-mark_3ff4fdf4.png";
const isPage = (value: string | null): value is Page =>
  ["Overview", "Patients", "Appointments", "Clinical", "Pharmacy & Lab", "Billing", "Archive", "Reports"].includes(value ?? "");

const navItems: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Patients", icon: UsersRound },
  { label: "Appointments", icon: CalendarDays },
  { label: "Clinical", icon: Stethoscope, permission: "medicalRecordRead" },
  { label: "Pharmacy & Lab", icon: FlaskConical, permission: "medicalRecordRead" },
  { label: "Billing", icon: ReceiptText, permission: "billingRead" },
  { label: "Archive", icon: ArchiveRestore, permission: "archiveRead" },
  { label: "Reports", icon: TrendingUp, permission: "reportingRead" },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const initials = (name?: string | null) =>
  (name || "Clinical User")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

export const shouldRenderAccessDenied = (role: HmsRole, page: Page) => !canAccessHmsPage(role, page);

export default function Home() {
  const auth = useAuth();
  if (auth.loading || !auth.isAuthenticated) {
    return (
      <DashboardLayout>
        <div />
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout>
      <Workspace />
    </DashboardLayout>
  );
}

function Workspace() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState<Page>(() => {
    const view = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("view");
    return isPage(view) ? view : "Overview";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [patientModal, setPatientModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentBillId, setPaymentBillId] = useState<number | null>(null);
  const [report, setReport] = useState("Revenue");
  const [editingPatient, setEditingPatient] = useState<any | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<any | null>(null);
  const [userDropdown, setUserDropdown] = useState(false);

  const utils = trpc.useUtils();
  const overview = trpc.hms.overview.useQuery(undefined, { refetchInterval: 20_000, refetchOnWindowFocus: true });
  const roleContext = trpc.hms.roleContext.useQuery();
  const role = (roleContext.data?.role ?? user?.role ?? "receptionist") as HmsRole;
  const can = (permission: HmsPermission) => hasHmsPermission(role, permission);
  const billingDesk = trpc.hms.billingDesk.useQuery(undefined, {
    enabled: roleContext.isSuccess && page === "Billing" && can("billingRead"),
    refetchOnWindowFocus: true,
  });

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3600);
  };

  const createPatient = trpc.hms.createPatient.useMutation({
    onSuccess: async (patient) => {
      setPatientModal(false);
      notify(`${patient.fullName} added to the patient register.`);
      await utils.hms.overview.invalidate();
    },
    onError: (error) => notify(error.message),
  });

  const recordPayment = trpc.hms.recordPayment.useMutation({
    onSuccess: async () => {
      setPaymentModal(false);
      notify("Payment recorded and invoice recalculated.");
      await utils.hms.billingDesk.invalidate();
    },
    onError: (error) => notify(error.message),
  });

  const updateStatus = trpc.hms.updateAppointmentStatus.useMutation({
    onSuccess: async () => {
      notify("Appointment status updated.");
      await utils.hms.overview.invalidate();
    },
    onError: (error) => notify(error.message),
  });

  const data = overview.data;
  const patients = data?.patients ?? [];
  const clinicians = data?.clinicians ?? [];
  const appointments = data?.appointments ?? [];
  const bills = billingDesk.data?.bills ?? [];
  const paymentTotals = billingDesk.data?.paymentTotals ?? {};
  const visibleNav = navItems.filter((item) => !item.permission || can(item.permission));

  const patientMatches = useMemo(
    () =>
      patients.filter((patient) =>
        `${patient.fullName} ${patient.patientCode} ${patient.careContext}`.toLowerCase().includes(query.toLowerCase())
      ),
    [patients, query]
  );

  const appointmentMatches = useMemo(
    () =>
      appointments.filter(({ appointment, patient, clinician }) =>
        `${appointment.reason} ${patient.fullName} ${clinician.fullName}`.toLowerCase().includes(query.toLowerCase())
      ),
    [appointments, query]
  );

  const paidByBill = paymentTotals;
  const billed = billingDesk.data?.financialSummary.totalBilled ?? 0;
  const collected = billingDesk.data?.financialSummary.totalCollected ?? 0;
  const outstanding = billingDesk.data?.financialSummary.outstanding ?? 0;

  const submitPatient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createPatient.mutate({
      fullName: String(form.get("fullName")),
      gender: String(form.get("gender")) as "Female" | "Male" | "Other" | "Not specified",
      phone: String(form.get("phone")),
      careContext: String(form.get("careContext")),
    });
  };

  const submitPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (paymentBillId && paymentAmount > 0) {
      recordPayment.mutate({ billId: paymentBillId, amount: paymentAmount, method: "Card" });
    }
  };

  const openPayment = () => {
    const target = bills.find(({ bill }) => bill.status !== "Paid");
    if (!target) return notify("All invoices are paid.");
    setPaymentBillId(target.bill.id);
    setPaymentAmount(Math.max(1, Number(target.bill.totalAmount) - (paidByBill[target.bill.id] ?? 0)));
    setPaymentModal(true);
  };

  const advanceAppointment = (appointmentId: number, status: "Checked in" | "Completed") => {
    const required = status === "Checked in" ? "appointmentCheckIn" : "appointmentComplete";
    if (!can(required)) return notify("Your role cannot update this appointment status.");
    updateStatus.mutate({ appointmentId, status });
  };

  let content: ReactNode;
  if (overview.isLoading || roleContext.isLoading) content = <Loading />;
  else if (shouldRenderAccessDenied(role, page))
    content = <AccessDenied page={page} role={role} onReturn={() => setPage("Overview")} />;
  else if (page === "Overview")
    content = (
      <Overview
        appointments={appointments}
        patients={patients.length}
        clinicians={clinicians.length}
        onNavigate={setPage}
        onAdvance={advanceAppointment}
        onEdit={setEditingAppointment}
        canCheckIn={can("appointmentCheckIn")}
        canComplete={can("appointmentComplete")}
        canEdit={can("appointmentEdit")}
      />
    );
  else if (page === "Patients")
    content = (
      <PatientDirectory
        patients={patientMatches}
        canCreate={can("patientCreate")}
        canEdit={can("patientEdit")}
        onCreate={() => setPatientModal(true)}
        onEdit={setEditingPatient}
      />
    );
  else if (page === "Appointments")
    content = (
      <section className="space-y-7">
        <PageTitle eyebrow="Scheduling center" title="Protected appointment calendar" />
        <BookingCalendar clinicians={clinicians} patients={patients} onNotice={notify} canBook={can("appointmentBook")} />
        <AppointmentBoard
          appointments={appointmentMatches}
          onAdvance={advanceAppointment}
          onEdit={setEditingAppointment}
          canCheckIn={can("appointmentCheckIn")}
          canComplete={can("appointmentComplete")}
          canEdit={can("appointmentEdit")}
        />
      </section>
    );
  else if (page === "Clinical" || page === "Pharmacy & Lab")
    content = <MedicalRecords patients={patients} clinicians={clinicians} role={role} onNotice={notify} />;
  else if (page === "Billing")
    content = (
      <Billing
        bills={bills}
        paidByBill={paidByBill}
        billed={billed}
        collected={collected}
        outstanding={outstanding}
        canRecord={can("paymentRecord")}
        onRecord={openPayment}
      />
    );
  else if (page === "Archive") content = <ArchiveManagement onNotice={notify} />;
  else
    content = (
      <Reports
        report={report}
        onChange={setReport}
        clinicians={clinicians}
        isAdmin={role === "admin"}
        currentUserId={user!.id}
        onNotice={notify}
      />
    );

  return (
    <div className="min-h-screen bg-[#f7f7f3] text-[#10283a]">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[#e1e7e1] bg-[#fcfcf9] px-4 py-5 shadow-lg transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-64 xl:w-72 lg:shadow-none lg:translate-x-0 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-2">
            <button onClick={() => setPage("Overview")} className="flex items-center gap-3 text-left">
              <img src={logoUrl} alt="Clinical Ledger mark" className="h-9 w-9 object-contain" />
              <div>
                <p className="font-display text-[20px] leading-none text-[#10283a]">Clinical Ledger</p>
                <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[.14em] text-[#007c83]">
                  Hospital workspace
                </p>
              </div>
            </button>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-2 text-[#637381] hover:bg-[#f0f5f1] lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-8 flex-1 overflow-y-auto">
            <p className="px-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#96a29b]">Workspace</p>
            <nav className="mt-3 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = page === item.label;
                return (
                  <button
                    key={item.label}
                    onClick={() => {
                      setPage(item.label);
                      setMobileOpen(false);
                    }}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                      active ? "bg-[#e7f3f2] text-[#006f75]" : "text-[#586b78] hover:bg-[#f0f5f1]"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        active ? "bg-white text-[#007c83] shadow-sm" : "text-[#71808b]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate">{item.label}</span>
                    {active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#007c83]" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* User Profile Card in Sidebar */}
          <div className="relative mt-auto overflow-hidden rounded-[18px] border-t-4 border-t-[#29d0d7] bg-[#10283a] p-4 text-white">
            <div className="file-tab absolute right-4 top-0 h-9 w-16 border-r border-b border-[#3b6070]" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#90d6db]" />
                <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#90d6db]">
                  Secure workspace
                </span>
              </div>
              <span className="h-2 w-2 rounded-full bg-[#29d0d7]" />
            </div>
            <p className="mt-3 truncate text-sm font-bold">{user?.name || "Authorized clinician"}</p>
            <p className="mt-1 text-xs leading-5 text-[#bdd2da]">
              <span className="font-semibold capitalize text-[#29d0d7]">{role}</span> access · protected operations.
            </p>
          </div>

          <button
            onClick={logout}
            className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-[#637381] hover:bg-[#f0f5f1]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </aside>

        {/* Mobile Backdrop */}
        {mobileOpen && (
          <button
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-[#10283a]/40 backdrop-blur-xs lg:hidden"
          />
        )}

        {/* Main Workspace */}
        <main className="min-w-0 flex-1 flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-30 border-b border-[#e5e9e5] bg-[#f7f7f3]/95 px-4 py-3.5 backdrop-blur-md sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1600px] items-center gap-3 sm:gap-4">
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-xl border border-[#e2e8e3] bg-white p-2 text-[#526576] hover:bg-[#f0f5f1] lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="hidden items-center gap-2 text-xs font-bold text-[#71808b] md:flex">
                <PanelLeft className="h-4 w-4 text-[#007c83]" />
                <span>HMS /</span>
                <span className="font-extrabold text-[#10283a]">{page}</span>
              </div>

              {/* Search Bar */}
              <label className="ml-auto flex w-full max-w-[240px] sm:max-w-xs md:max-w-sm items-center gap-2.5 rounded-xl border border-[#e0e7e2] bg-white px-3 py-2 focus-within:border-[#007c83] focus-within:ring-2 focus-within:ring-[#8ccdd0]">
                <Search className="h-4 w-4 shrink-0 text-[#82909a]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search patient, doctor, record"
                  className="w-full bg-transparent text-xs sm:text-sm font-medium text-[#10283a] outline-none placeholder:text-[#9aa7ae]"
                />
              </label>

              <button
                onClick={() => notify("No new clinical alerts.")}
                className="relative rounded-xl border border-[#e0e7e2] bg-white p-2 text-[#526576] hover:bg-[#f0f5f1]"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
              </button>

              {/* User Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setUserDropdown(!userDropdown)}
                  className="flex items-center gap-2 rounded-xl border border-[#e0e7e2] bg-white px-2 py-1.5 hover:bg-[#f0f5f1]"
                >
                  <Avatar name={user?.name} small />
                  <span className="hidden sm:inline-block max-w-[100px] truncate text-xs font-bold text-[#193448]">
                    {user?.name?.split(" ")[0]}
                  </span>
                  <span className="hidden sm:inline-block rounded-full bg-[#e8f4f4] px-2 py-0.5 text-[9px] font-extrabold uppercase text-[#007c83]">
                    {role}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-[#82909a]" />
                </button>

                {userDropdown && (
                  <>
                    <button
                      className="fixed inset-0 z-40"
                      onClick={() => setUserDropdown(false)}
                      aria-label="Close user menu"
                    />
                    <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-[#e2e8e2] bg-white p-2 shadow-xl">
                      <div className="border-b border-[#edf0ed] px-3 py-2.5">
                        <p className="truncate text-xs font-bold text-[#10283a]">{user?.name}</p>
                        <p className="truncate font-mono text-[10px] text-[#637381]">{user?.email}</p>
                        <span className="mt-1.5 inline-block rounded-md bg-[#e8f4f4] px-2 py-0.5 text-[9px] font-extrabold uppercase text-[#007c83]">
                          Role: {role}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setUserDropdown(false);
                          logout();
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[#c25c4e] hover:bg-[#fff0ee]"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Content Area */}
          <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {content}
          </div>
        </main>
      </div>

      {/* Floating Notice Toast */}
      {notice && (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-2xl bg-[#10283a] px-4 py-3.5 text-sm font-bold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-3">
          <Check className="h-5 w-5 shrink-0 text-[#29d0d7]" />
          <span>{notice}</span>
        </div>
      )}

      {/* Modals */}
      {patientModal && (
        <Modal
          title="Add patient"
          subtitle="Create a persistent patient record for scheduling and billing."
          onClose={() => setPatientModal(false)}
        >
          <form onSubmit={submitPatient} className="space-y-4">
            <Input name="fullName" label="Full name" placeholder="e.g., Farhan Siddique" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select name="gender" label="Gender" options={["Female", "Male", "Other", "Not specified"]} />
              <Input name="phone" label="Phone" placeholder="+880 17xx xxx xxx" />
            </div>
            <Input name="careContext" label="Care context" placeholder="Initial assessment" />
            <Submit label={createPatient.isPending ? "Saving..." : "Add patient"} />
          </form>
        </Modal>
      )}

      {paymentModal && (
        <Modal
          title="Record payment"
          subtitle="Apply a persistent payment to the selected billing record."
          onClose={() => setPaymentModal(false)}
        >
          <form onSubmit={submitPayment} className="space-y-4">
            <Select
              name="bill"
              label="Invoice"
              value={String(paymentBillId ?? "")}
              onChange={(value) => setPaymentBillId(Number(value))}
              options={bills
                .filter(({ bill }) => bill.status !== "Paid")
                .map(({ bill, patient }) => ({ value: String(bill.id), label: `${bill.billCode} — ${patient.fullName}` }))}
            />
            <Input
              name="amount"
              label="Amount"
              placeholder="0"
              type="number"
              value={String(paymentAmount)}
              onChange={(value) => setPaymentAmount(Number(value))}
            />
            <Submit label={recordPayment.isPending ? "Recording..." : "Record payment"} />
          </form>
        </Modal>
      )}

      {editingPatient && (
        <PatientEditModal patient={editingPatient} onClose={() => setEditingPatient(null)} onNotice={notify} />
      )}

      {editingAppointment && (
        <AppointmentEditModal
          row={editingAppointment}
          patients={patients}
          clinicians={clinicians}
          onClose={() => setEditingAppointment(null)}
          onNotice={notify}
        />
      )}
    </div>
  );
}

function Overview({
  appointments,
  patients,
  clinicians,
  onNavigate,
  onAdvance,
  onEdit,
  canCheckIn,
  canComplete,
  canEdit,
}: {
  appointments: any[];
  patients: number;
  clinicians: number;
  onNavigate: (page: Page) => void;
  onAdvance: (id: number, status: "Checked in" | "Completed") => void;
  onEdit: (row: any) => void;
  canCheckIn: boolean;
  canComplete: boolean;
  canEdit: boolean;
}) {
  return (
    <section className="space-y-6 sm:space-y-7">
      <div className="grid gap-5 xl:grid-cols-[1.4fr_.9fr]">
        <div className="relative overflow-hidden rounded-[20px] border border-[#21435a] border-t-4 border-t-[#29d0d7] bg-[#10283a] p-6 sm:p-8 text-white">
          <div className="file-tab absolute right-8 top-0 h-11 w-36 border-r border-b border-[#3b6070]" />
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#90d6db]">
            Role-secured care operations
          </p>
          <h1 className="mt-4 font-display text-[34px] leading-[1.02] sm:text-[44px] lg:text-[48px]">
            Records, care,
            <br />
            in order.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-[#d7e7eb] sm:text-[15px] sm:leading-7">
            The workspace keeps clinical notes, prescriptions, laboratory orders, and scheduling within controlled staff roles.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 sm:mt-8">
            <button
              onClick={() => onNavigate("Clinical")}
              className="rounded-xl bg-[#29d0d7] px-4 py-3 text-xs sm:text-sm font-extrabold text-[#10283a] shadow-sm hover:bg-[#4ce0e6]"
            >
              Open medical records
            </button>
            <button
              onClick={() => onNavigate("Appointments")}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs sm:text-sm font-bold text-white hover:bg-white/15"
            >
              View calendar
            </button>
          </div>
        </div>

        <div className="rounded-[20px] border border-[#e2e8e2] bg-white p-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#007c83]">Care pulse</p>
          <h2 className="mt-1 font-display text-[26px] sm:text-[29px] text-[#10283a]">At a glance</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6">
            <Metric value={String(appointments.length).padStart(2, "0")} label="appointments" />
            <Metric value={String(patients).padStart(2, "0")} label="patient records" />
            <Metric value={String(clinicians).padStart(2, "0")} label="clinicians" />
            <Metric value="Scoped" label="access model" />
          </div>
        </div>
      </div>

      <AppointmentBoard
        appointments={appointments.slice(0, 5)}
        onAdvance={onAdvance}
        onEdit={onEdit}
        canCheckIn={canCheckIn}
        canComplete={canComplete}
        canEdit={canEdit}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={<ShieldAlert className="h-5 w-5" />} label="Role boundaries" value="Enforced" />
        <Stat icon={<Stethoscope className="h-5 w-5" />} label="Medical records" value="Protected" />
        <Stat icon={<FlaskConical className="h-5 w-5" />} label="Lab workflow" value="Connected" />
      </div>
    </section>
  );
}

function PatientDirectory({
  patients,
  canCreate,
  canEdit,
  onCreate,
  onEdit,
}: {
  patients: any[];
  canCreate: boolean;
  canEdit: boolean;
  onCreate: () => void;
  onEdit: (patient: any) => void;
}) {
  return (
    <section className="space-y-6 sm:space-y-7">
      <PageTitle
        eyebrow="Patient registry"
        title="People under care"
        action={
          canCreate ? (
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#007c83] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-white shadow-sm hover:bg-[#006b71]"
            >
              <UserPlus className="h-4 w-4" />
              New patient
            </button>
          ) : undefined
        }
      />
      <div className="overflow-hidden rounded-[20px] border border-[#e2e8e2] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="bg-[#fbfcfa] text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7a8993]">
                <th className="px-5 py-4">Patient</th>
                <th className="px-5 py-4">Care context</th>
                <th className="px-5 py-4">Phone</th>
                <th className="px-5 py-4">Registered</th>
                <th className="px-5 py-4 text-right" />
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id} className="border-t border-[#edf0ed] text-sm hover:bg-[#fbfcfb]">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={patient.fullName} />
                      <div>
                        <p className="font-extrabold text-[#193448]">{patient.fullName}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-[#82909a]">{patient.patientCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[#344f61]">{patient.careContext}</td>
                  <td className="px-5 py-4 font-mono text-xs text-[#637381]">{patient.phone}</td>
                  <td className="px-5 py-4 text-xs text-[#637381]">{new Date(patient.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-right">
                    {canEdit && (
                      <button
                        onClick={() => onEdit(patient)}
                        className="rounded-lg border border-[#dce7e3] p-2 text-[#007c83] hover:bg-[#e8f4f4]"
                        title="Edit patient"
                      >
                        <PencilLine className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function AppointmentBoard({
  appointments,
  onAdvance,
  onEdit,
  canCheckIn,
  canComplete,
  canEdit,
}: {
  appointments: any[];
  onAdvance: (id: number, status: "Checked in" | "Completed") => void;
  onEdit: (row: any) => void;
  canCheckIn: boolean;
  canComplete: boolean;
  canEdit: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-[#e2e8e2] bg-white p-5 sm:p-6 shadow-xs">
      <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#007c83]">Appointment board</p>
      <h2 className="mt-1 font-display text-[26px] sm:text-[29px] text-[#10283a]">Secure visit sequence</h2>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[650px] text-left">
          <thead>
            <tr className="border-y border-[#e8ece8] text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7a8993]">
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Patient</th>
              <th className="px-3 py-3">Reason</th>
              <th className="px-3 py-3">Clinician</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {appointments.map((row) => {
              const { appointment, patient, clinician } = row;
              const canAct =
                (appointment.status === "Scheduled" && canCheckIn) ||
                (appointment.status === "Checked in" && canComplete);
              const nextStatus = appointment.status === "Scheduled" ? "Checked in" : "Completed";
              return (
                <tr key={appointment.id} className="border-b border-[#edf0ed] text-sm last:border-0 hover:bg-[#fbfcfb]">
                  <td className="px-3 py-4 font-mono text-xs font-semibold text-[#263f51]">
                    {new Date(appointment.startsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-4 font-extrabold text-[#193448]">{patient.fullName}</td>
                  <td className="px-3 py-4 text-xs sm:text-sm text-[#526576]">{appointment.reason}</td>
                  <td className="px-3 py-4 text-xs sm:text-sm text-[#526576]">{clinician.fullName}</td>
                  <td className="px-3 py-4">
                    <Status value={appointment.status} />
                  </td>
                  <td className="px-3 py-4 text-right">
                    <div className="flex justify-end gap-1.5 sm:gap-2">
                      {canEdit && (
                        <button
                          onClick={() => onEdit(row)}
                          className="rounded-lg border border-[#dce7e3] p-1.5 text-[#007c83] hover:bg-[#e8f4f4]"
                          title="Edit appointment"
                        >
                          <PencilLine className="h-4 w-4" />
                        </button>
                      )}
                      {canAct && (
                        <button
                          onClick={() => onAdvance(appointment.id, nextStatus)}
                          className="rounded-lg border border-[#dce7e3] p-1.5 text-[#007c83] hover:bg-[#e8f4f4]"
                          title={nextStatus === "Checked in" ? "Check in patient" : "Complete appointment"}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Billing({
  bills,
  paidByBill,
  billed,
  collected,
  outstanding,
  canRecord,
  onRecord,
}: {
  bills: any[];
  paidByBill: Record<number, number>;
  billed: number;
  collected: number;
  outstanding: number;
  canRecord: boolean;
  onRecord: () => void;
}) {
  return (
    <section className="space-y-6 sm:space-y-7">
      <PageTitle
        eyebrow="Financial control"
        title="Billing and payments"
        action={
          canRecord ? (
            <button
              onClick={onRecord}
              className="inline-flex items-center gap-2 rounded-xl bg-[#007c83] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-white shadow-sm hover:bg-[#006b71]"
            >
              <CreditCard className="h-4 w-4" />
              Record payment
            </button>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={<ReceiptText className="h-5 w-5" />} label="Issued" value={money(billed)} />
        <Stat icon={<CircleDollarSign className="h-5 w-5" />} label="Collected" value={money(collected)} />
        <Stat icon={<ShieldAlert className="h-5 w-5" />} label="Outstanding" value={money(outstanding)} />
      </div>
      <div className="overflow-hidden rounded-[20px] border border-[#e2e8e2] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead>
              <tr className="bg-[#fbfcfa] text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7a8993]">
                <th className="px-5 py-4">Invoice</th>
                <th className="px-5 py-4">Patient</th>
                <th className="px-5 py-4">Total</th>
                <th className="px-5 py-4">Paid</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(({ bill, patient }) => (
                <tr key={bill.id} className="border-t border-[#edf0ed] text-sm hover:bg-[#fbfcfb]">
                  <td className="px-5 py-4 font-mono text-xs font-bold text-[#007c83]">{bill.billCode}</td>
                  <td className="px-5 py-4 font-extrabold text-[#193448]">{patient.fullName}</td>
                  <td className="px-5 py-4 font-semibold">{money(Number(bill.totalAmount))}</td>
                  <td className="px-5 py-4 text-[#526576]">{money(paidByBill[bill.id] ?? 0)}</td>
                  <td className="px-5 py-4">
                    <Status value={bill.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Reports({
  report,
  onChange,
  clinicians,
  isAdmin,
  currentUserId,
  onNotice,
}: {
  report: string;
  onChange: (value: string) => void;
  clinicians: any[];
  isAdmin: boolean;
  currentUserId: number;
  onNotice: (message: string) => void;
}) {
  const reports = ["Revenue", "Doctor workload", "Patient history", "Medicine inventory"];
  return (
    <section className="space-y-6 sm:space-y-7">
      <PageTitle eyebrow="Management reports" title="Patterns worth acting on" />
      <div className="flex flex-wrap gap-2">
        {reports.map((item) => (
          <button
            key={item}
            onClick={() => onChange(item)}
            className={`rounded-full px-4 py-2 text-xs font-extrabold transition-colors ${
              report === item ? "bg-[#10283a] text-white" : "bg-white text-[#637381] ring-1 ring-[#e0e7e2] hover:bg-[#f0f5f1]"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-[20px] border border-[#e2e8e2] bg-white p-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#007c83]">{report}</p>
          <h3 className="mt-1 font-display text-[26px] sm:text-[31px] text-[#10283a]">
            Management visibility, protected by role.
          </h3>
          <div className="mt-7 flex h-52 sm:h-56 items-end gap-2 sm:gap-4 border-b border-[#e3e8e3] px-2 pb-2">
            {[45, 66, 52, 78, 61, 86, 72].map((height, index) => (
              <div className="flex flex-1 flex-col justify-end" key={index}>
                <div
                  className={`w-full rounded-t-lg transition-all duration-300 ${
                    index === 5 ? "bg-[#007c83]" : "bg-[#b8d9d8]"
                  }`}
                  style={{ height: `${height}%` }}
                />
              </div>
            ))}
          </div>
        </div>
        <aside className="rounded-[20px] border-t-4 border-t-[#29d0d7] bg-[#10283a] p-6 text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#90d6db]">Report insight</p>
          <h3 className="mt-2 font-display text-[26px] sm:text-[30px] leading-tight">Permission-aware reporting.</h3>
          <p className="mt-4 text-sm leading-6 text-[#d7e7eb]">
            Administrative reporting is separated from clinical and financial operational workflows.
          </p>
          <button
            onClick={() => onNotice("Report exported successfully.")}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#29d0d7] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-[#10283a] hover:bg-[#4ce0e6]"
          >
            <FileText className="h-4 w-4" />
            Export report
          </button>
        </aside>
      </div>
      {isAdmin && (
        <AccountManagement clinicians={clinicians} currentUserId={currentUserId} onNotice={onNotice} />
      )}
    </section>
  );
}

function PageTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#007c83]">{eyebrow}</p>
        <h2 className="mt-1 font-display text-[28px] sm:text-[32px] leading-none text-[#10283a]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[#e2e8e2] bg-white p-5 shadow-xs">
      <div className="text-[#007c83]">{icon}</div>
      <p className="mt-4 font-display text-[28px] sm:text-[31px] text-[#10283a]">{value}</p>
      <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">{label}</p>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-[26px] sm:text-[31px] text-[#10283a]">{value}</p>
      <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#637381]">{label}</p>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const tone =
    value === "Paid" || value === "Completed" || value === "Resulted" || value === "Active"
      ? "bg-[#eaf5ef] text-[#297353]"
      : value === "Partial" || value === "Checked in"
      ? "bg-[#fff4dd] text-[#9a6515]"
      : value === "Due" || value === "Urgent"
      ? "bg-[#fff0ee] text-[#ae493d]"
      : "bg-[#e8f4f4] text-[#007c83]";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] ${tone}`}>
      {value}
    </span>
  );
}

function Avatar({ name, small = false }: { name?: string | null; small?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#d9eeee] font-mono font-bold text-[#007c83] ${
        small ? "h-7 w-7 text-[9px]" : "h-9 w-9 text-[10px]"
      }`}
    >
      {initials(name)}
    </span>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#10283a]/50 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[22px] border-t-4 border-t-[#29d0d7] bg-white p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#007c83]">Record action</p>
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
  name,
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">{label}</span>
      <input
        required
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] px-3.5 text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83] focus:ring-2 focus:ring-[#8ccdd0]"
      />
    </label>
  );
}

function Select({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: (string | { value: string; label: string })[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">{label}</span>
      <select
        required
        name={name}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3.5 text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83] focus:ring-2 focus:ring-[#8ccdd0]"
      >
        {options.map((option) =>
          typeof option === "string" ? (
            <option key={option} value={option}>
              {option}
            </option>
          ) : (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          )
        )}
      </select>
    </label>
  );
}

function Submit({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="inline-flex w-full items-center justify-center rounded-xl bg-[#007c83] px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-[#006b71]"
    >
      {label}
    </button>
  );
}

function Loading() {
  return (
    <div className="grid min-h-[400px] place-items-center rounded-[20px] border border-dashed border-[#c9dfdc] bg-white p-6">
      <div className="flex items-center gap-3 text-sm font-bold text-[#526576]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#007c83] border-t-transparent" />
        Loading protected HMS records...
      </div>
    </div>
  );
}

function AccessDenied({ page, role, onReturn }: { page: Page; role: HmsRole; onReturn: () => void }) {
  return (
    <section className="grid min-h-[400px] place-items-center rounded-[20px] border border-dashed border-[#c9dfdc] bg-white p-8 text-center">
      <div className="max-w-md">
        <ShieldAlert className="mx-auto h-9 w-9 text-[#c25c4e]" />
        <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.15em] text-[#c25c4e]">Restricted module</p>
        <h2 className="mt-2 font-display text-[30px] sm:text-[34px] text-[#10283a]">
          {page} is not available to your role.
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#637381]">
          The <strong className="capitalize text-[#10283a]">{role}</strong> role does not have permission to open this protected workspace.
        </p>
        <button
          onClick={onReturn}
          className="mt-6 rounded-xl bg-[#007c83] px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-[#006b71]"
        >
          Return to overview
        </button>
      </div>
    </section>
  );
}
