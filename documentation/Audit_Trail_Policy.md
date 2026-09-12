# Audit Trail Policy
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Purpose

This policy defines the requirements for maintaining complete, tamper-evident audit trails for all transactions involving controlled substances, narcotics, and expiry-sensitive medications within the Pharmacy Management System (PMS).

---

## 2. Scope

This policy applies to:
- All system users (pharmacists, nurses, admins, procurement staff)
- All transactions involving Schedule H, H1, and X drugs
- Expiry date tracking, batch recall events, and stock adjustments
- Electronic sign-offs and approvals

---

## 3. Events That Must Be Logged

| Event Type | Details Captured |
|---|---|
| Drug dispensing | User ID, timestamp, drug name, batch, quantity, patient ID |
| Stock adjustments | Reason code, adjusted quantity, before/after values |
| Expiry date updates | Old/new date, user, justification |
| Controlled substance issue | Dual authorization IDs, witness ID |
| Login / Logout | User ID, IP address, timestamp |
| Failed login attempts | User ID, IP, timestamp |
| Record modification | Field changed, old value, new value, user, timestamp |
| Drug recall events | Drug/batch ID, action taken, user, timestamp |
| Returns processing | Return reason, quantity, approving user |

---

## 4. Log Integrity Requirements

- Audit logs are **append-only** — no update or delete is permitted.
- Each log entry must include a cryptographic hash of the previous entry (chaining).
- Logs must be signed with the user's credentials at the time of the event.
- System timestamps must be synchronized via NTP.

---

## 5. Retention Period

| Category | Retention Period |
|---|---|
| General transaction logs | 5 years |
| Controlled substance logs | 7 years (as per NDPS Act / DEA regulations) |
| Expiry and recall logs | 10 years |
| Security/access logs | 3 years |

---

## 6. Access to Audit Logs

- Audit logs are **read-only** and accessible only to:
  - System Administrators
  - Compliance Officers
  - Authorized Auditors
- Any access to audit logs is itself logged.

---

## 7. Review Schedule

- Automated daily integrity checks on log files.
- Monthly audit log review by the Compliance Officer.
- Annual third-party audit of log trail completeness.

---

## 8. Non-Compliance

Violations of this policy (e.g., attempts to delete or modify audit records) will result in immediate account suspension and escalation to the legal/compliance team.

---

*Approved by: [Compliance Officer Name]*
*Next Review Date: September 2027*
