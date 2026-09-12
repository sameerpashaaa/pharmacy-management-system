# Role-Based Access Control (RBAC) Matrix
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## Roles

| Role | Description |
|---|---|
| `admin` | System administrator — full access |
| `pharmacist` | Licensed pharmacist — dispensing, stock, receiving |
| `nurse` | Ward nurse — request drugs, view dispensing history |
| `procurement` | Procurement officer — POs, suppliers, GRNs |
| `auditor` | Read-only access to audit logs and reports |

---

## Permission Matrix

### Drug Master

| Action | Admin | Pharmacist | Nurse | Procurement | Auditor |
|---|---|---|---|---|---|
| View drugs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create drug | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit drug | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete drug | ✅ | ❌ | ❌ | ❌ | ❌ |

### Stock Management

| Action | Admin | Pharmacist | Nurse | Procurement | Auditor |
|---|---|---|---|---|---|
| View stock | ✅ | ✅ | ✅ | ✅ | ✅ |
| Receive stock (GRN) | ✅ | ✅ | ❌ | ✅ | ❌ |
| Issue / Dispense | ✅ | ✅ | ❌ | ❌ | ❌ |
| Stock adjustment | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve large adjustment | ✅ | ❌ | ❌ | ❌ | ❌ |
| View adjustment history | ✅ | ✅ | ❌ | ❌ | ✅ |

### Controlled Substances (Schedule X)

| Action | Admin | Pharmacist | Nurse | Procurement | Auditor |
|---|---|---|---|---|---|
| View narcotic stock | ✅ | ✅ | ❌ | ❌ | ✅ |
| Dispense (1st auth) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Dispense (2nd auth) | ✅ | ✅ | ❌ | ❌ | ❌ |
| View narcotic register | ✅ | ✅ | ❌ | ❌ | ✅ |

### Procurement

| Action | Admin | Pharmacist | Nurse | Procurement | Auditor |
|---|---|---|---|---|---|
| View suppliers | ✅ | ✅ | ❌ | ✅ | ✅ |
| Add/edit supplier | ✅ | ❌ | ❌ | ✅ | ❌ |
| Approve supplier | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create PO | ✅ | ❌ | ❌ | ✅ | ❌ |
| Approve PO | ✅ | ❌ | ❌ | ❌ | ❌ |
| Receive GRN | ✅ | ✅ | ❌ | ✅ | ❌ |

### Users & System Administration

| Action | Admin | Pharmacist | Nurse | Procurement | Auditor |
|---|---|---|---|---|---|
| Manage users | ✅ | ❌ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | ❌ | ❌ | ❌ | ✅ |
| System settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Export reports | ✅ | ✅ | ❌ | ✅ | ✅ |
| Drug recall management | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Notes

- All API endpoints validate the role from the JWT token before processing.
- UI elements are hidden/disabled based on role (defense in depth).
- Privilege escalation attempts are logged and trigger a security alert.

---

*Owner: [Admin / Security Team]*
*Next Review: March 2027*
