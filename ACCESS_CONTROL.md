# Hospital Management System Access Control

The application uses an explicit, server-enforced role model. The interface mirrors these restrictions for clarity, but the protected procedures remain the authoritative enforcement point.

| Capability | Admin | Doctor | Receptionist |
|---|:---:|:---:|:---:|
| View patient directory and appointments | Yes | Yes | Yes |
| Register and edit patient records | Yes | No | Yes |
| Archive and restore an unlinked patient registration | Yes | No | Yes |
| Book and reschedule appointments | Yes | No | Yes |
| Archive and restore an unlinked Scheduled or Cancelled appointment | Yes | No | Yes |
| Check in appointments | Yes | No | Yes |
| Complete appointments | Yes | Yes | No |
| Read medical records | Yes | Yes | No |
| Create clinical notes and prescriptions | Yes | Yes | No |
| Order and record laboratory results | Yes | Yes | No |
| View billing and record payments | Yes | No | Yes |
| View management reports and assign roles | Yes | No | No |
| Create, edit, reset, or deactivate user accounts | Yes | No | No |

Doctors are linked to a clinician profile. When a doctor writes a clinical note, prescription, or laboratory record, the server resolves the linked clinician profile and does not accept an arbitrary author identity from the browser. Administrative users may select the appropriate clinician for operational corrections or supervised data entry. Receptionists may amend registration and scheduling details, but cannot access or change clinical notes, prescriptions, laboratory records, reports, account credentials, or staff roles.

Archiving is intentionally limited to operational records with no clinical or financial history. Administrators and Receptionists may archive only Scheduled or Cancelled appointments that have no linked bill, clinical note, prescription, or laboratory order. They may archive a patient registration only when no appointment, bill, clinical note, prescription, or laboratory order refers to that patient. The server evaluates these relationships before archiving; the interface requires an explicit confirmation that explains the record will leave active operations but can be restored from the Archive workspace. The HMS does not expose permanent deletion in the operational interface.

Restoration is available to the same operational roles. Restored patients return to the active registry. A restored appointment is rechecked against the clinician’s current availability and conflicting active bookings; if the original slot is no longer valid, the record remains archived until an authorized user chooses a new appointment time.
