export const HMS_ROLES = ["admin", "doctor", "receptionist"] as const;
export type HmsRole = (typeof HMS_ROLES)[number];

export const HMS_PERMISSIONS = {
  overview: ["admin", "doctor", "receptionist"],
  patientRead: ["admin", "doctor", "receptionist"],
  patientCreate: ["admin", "receptionist"],
  patientEdit: ["admin", "receptionist"],
  patientArchive: ["admin", "receptionist"],
  appointmentRead: ["admin", "doctor", "receptionist"],
  appointmentBook: ["admin", "receptionist"],
  appointmentEdit: ["admin", "receptionist"],
  appointmentArchive: ["admin", "receptionist"],
  archiveRead: ["admin", "receptionist"],
  appointmentCheckIn: ["admin", "receptionist"],
  appointmentComplete: ["admin", "doctor"],
  medicalRecordRead: ["admin", "doctor"],
  clinicalNoteWrite: ["admin", "doctor"],
  prescriptionWrite: ["admin", "doctor"],
  laboratoryOrderWrite: ["admin", "doctor"],
  laboratoryResultWrite: ["admin", "doctor"],
  billingRead: ["admin", "receptionist"],
  paymentRecord: ["admin", "receptionist"],
  reportingRead: ["admin"],
  userRoleManage: ["admin"],
  userCredentialManage: ["admin"],
} as const satisfies Record<string, readonly HmsRole[]>;

export type HmsPermission = keyof typeof HMS_PERMISSIONS;

export type HmsPage = "Overview" | "Patients" | "Appointments" | "Clinical" | "Pharmacy & Lab" | "Billing" | "Archive" | "Reports";

export const HMS_PAGE_PERMISSIONS: Partial<Record<HmsPage, HmsPermission>> = {
  Clinical: "medicalRecordRead",
  "Pharmacy & Lab": "medicalRecordRead",
  Billing: "billingRead",
  Archive: "archiveRead",
  Reports: "reportingRead",
};

export function hasHmsPermission(role: string | null | undefined, permission: HmsPermission) {
  return (HMS_PERMISSIONS[permission] as readonly string[]).includes(role ?? "");
}

export function canAccessHmsPage(role: string | null | undefined, page: HmsPage) {
  const permission = HMS_PAGE_PERMISSIONS[page];
  return !permission || hasHmsPermission(role, permission);
}
