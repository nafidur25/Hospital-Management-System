import React, { type FormEvent, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { clearHmsSessionCache } from "@/lib/sessionCache";
import { useQueryClient } from "@tanstack/react-query";
import { COOKIE_NAME } from "@shared/const";
import { CalendarDays, KeyRound, Loader2, ShieldCheck, UserCheck } from "lucide-react";

const DEMO_PRESETS = [
  { role: "Admin", email: "admin@clinicalledger.demo", pass: "CL-Admin!2026", desc: "Full operations & audit" },
  { role: "Doctor", email: "doctor@clinicalledger.demo", pass: "CL-Doctor!2026", desc: "Clinical notes & rx" },
  { role: "Receptionist", email: "reception@clinicalledger.demo", pass: "CL-Frontdesk!2026", desc: "Patient registry & desk" },
];

function CredentialSignIn() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("admin@clinicalledger.demo");
  const [password, setPassword] = useState("CL-Admin!2026");
  const [selectedRole, setSelectedRole] = useState<string>("Admin");

  const login = trpc.auth.demoLogin.useMutation({
    onSuccess: async (data) => {
      if (data?.token) {
        try {
          sessionStorage.setItem("manus-cookie", `${COOKIE_NAME}=${data.token}`);
        } catch {
          // ignore storage error
        }
      }
      await clearHmsSessionCache(queryClient);
      await utils.auth.me.invalidate();
    },
  });

  const handleSelectPreset = (preset: typeof DEMO_PRESETS[0]) => {
    setEmail(preset.email);
    setPassword(preset.pass);
    setSelectedRole(preset.role);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-2xl border border-[#d9eae7] bg-[#f3fbfa] p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#007c83]">
            Demo access accounts
          </p>
          <span className="text-[10px] font-bold text-[#637381]">Click to auto-fill</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {DEMO_PRESETS.map((preset) => {
            const active = selectedRole === preset.role && email === preset.email;
            return (
              <button
                key={preset.role}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`group rounded-xl p-3 text-left transition-all ${
                  active
                    ? "border-2 border-[#007c83] bg-white shadow-sm ring-1 ring-[#007c83]"
                    : "border border-[#d2e4e1] bg-white/80 hover:border-[#007c83] hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold text-[#007c83]">{preset.role}</p>
                  {active && <UserCheck className="h-3.5 w-3.5 text-[#007c83]" />}
                </div>
                <p className="mt-1 truncate font-mono text-[10px] font-semibold text-[#344f61]">
                  {preset.email}
                </p>
                <p className="mt-0.5 text-[9px] text-[#71808b]">{preset.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#637381]">
            Work email
          </span>
          <input
            required
            autoComplete="username"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setSelectedRole("");
            }}
            placeholder="name@clinicalledger.demo"
            className="mt-2 h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3.5 text-sm font-semibold text-[#193448] outline-none transition focus:border-[#007c83] focus:ring-2 focus:ring-[#b9e3e4]"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#637381]">
            Password
          </span>
          <input
            required
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter role password"
            className="mt-2 h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3.5 text-sm font-semibold text-[#193448] outline-none transition focus:border-[#007c83] focus:ring-2 focus:ring-[#b9e3e4]"
          />
        </label>
        {login.error && (
          <p role="alert" className="rounded-xl bg-[#fff0ee] px-3.5 py-2.5 text-xs font-bold text-[#ae493d]">
            {login.error.message}
          </p>
        )}
        <button
          disabled={login.isPending}
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#007c83] px-5 py-3.5 text-sm font-extrabold text-white shadow-sm transition-transform duration-150 active:scale-[.98] hover:bg-[#006b71] disabled:opacity-60"
        >
          {login.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {login.isPending ? "Signing in..." : "Sign in with credentials"}
        </button>
      </form>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f7f3] p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8e2] bg-white px-6 py-4 text-sm font-bold text-[#526576] shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-[#007c83]" />
          Checking secure session...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="paper-noise flex min-h-screen items-center justify-center bg-[#f7f7f3] px-4 py-8 sm:px-6 sm:py-12">
        <section className="relative w-full max-w-xl overflow-hidden rounded-[24px] border border-[#d7e8e5] border-t-4 border-t-[#29d0d7] bg-white p-6 shadow-[0_24px_70px_rgba(16,40,58,.12)] sm:p-8 md:p-10">
          <div className="file-tab absolute right-8 top-0 h-12 w-28 border-r border-b border-[#c8e4e1]" />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f4f4] text-[#007c83]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[.17em] text-[#007c83]">
            Clinical Ledger · Hospital Management System
          </p>
          <h1 className="mt-2 font-display text-[32px] leading-[1.05] text-[#10283a] sm:text-[40px]">
            Sign in to manage care, without losing the record.
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#526576] sm:text-[15px] sm:leading-7">
            Select an Admin, Doctor, or Receptionist role profile below to launch into the role-secured clinical workspace.
          </p>

          <CredentialSignIn />

          <div className="mt-6 flex items-center gap-3 border-t border-[#e9efea] pt-4 text-xs text-[#82909a]">
            <CalendarDays className="h-4 w-4 shrink-0 text-[#007c83]" />
            <span>Protected clinical workspace. Availability, medical records, and billing are protected by active session roles.</span>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
