# Test Cases & Test Scripts
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## Module: Authentication

| TC ID | Test Case | Steps | Expected Result | Status |
|---|---|---|---|---|
| TC-AUTH-001 | Valid login | Enter valid email/password → Submit | Access token returned; dashboard loads | — |
| TC-AUTH-002 | Invalid password | Enter valid email, wrong password | "Invalid credentials" error; no token | — |
| TC-AUTH-003 | Account lockout | Enter wrong password 5 times | Account locked for 15 min; lockout email sent | — |
| TC-AUTH-004 | Token expiry | Wait 15 min; make API call with old token | 401 Unauthorized returned | — |
| TC-AUTH-005 | Refresh token | Use valid refresh token | New access token returned | — |

---

## Module: Stock Management

| TC ID | Test Case | Steps | Expected Result | Status |
|---|---|---|---|---|
| TC-STK-001 | Receive valid stock | Create GRN with valid PO, scan barcode, enter qty | Stock levels updated; batch record created; audit log entry created | — |
| TC-STK-002 | Dispense drug (FEFO) | Dispense 2 drugs with different expiry batches | Earliest expiry batch selected first | — |
| TC-STK-003 | Dispense expired drug | Attempt to dispense expired batch | System blocks; "Batch Expired" error shown | — |
| TC-STK-004 | Adjust stock | Enter negative adjustment with BREAKAGE reason | Stock reduced; audit log created; manager notified if > 10 units | — |
| TC-STK-005 | Dispense > available qty | Request 200 units where only 100 available | "Insufficient stock" error; no stock deducted | — |

---

## Module: Controlled Substances (Schedule X)

| TC ID | Test Case | Steps | Expected Result | Status |
|---|---|---|---|---|
| TC-NRX-001 | Dispense with dual auth | Enter auth1 + auth2 pharmacist IDs → dispense | Stock deducted; both IDs recorded in audit log | — |
| TC-NRX-002 | Single auth attempt | Only 1 pharmacist authorizes Schedule X | System blocks; "Dual authorization required" error | — |
| TC-NRX-003 | Narcotic register report | Generate daily narcotic register | Report includes all Schedule X transactions for the day | — |

---

## Module: Expiry & Alerts

| TC ID | Test Case | Steps | Expected Result | Status |
|---|---|---|---|---|
| TC-EXP-001 | 30-day expiry alert | Add batch expiring in 25 days; run alert job | Critical alert created; SMS + email sent | — |
| TC-EXP-002 | 60-day expiry alert | Add batch expiring in 55 days; run alert job | Warning alert in dashboard | — |
| TC-EXP-003 | Reorder alert | Reduce stock to below reorder level | Reorder alert created; in-app notification shown | — |

---

## Module: Procurement

| TC ID | Test Case | Steps | Expected Result | Status |
|---|---|---|---|---|
| TC-PO-001 | Create and approve PO | Create draft PO → Submit for approval → Admin approves | PO status changes to APPROVED; supplier notified | — |
| TC-PO-002 | PO with unapproved supplier | Select unapproved supplier when creating PO | System blocks PO creation | — |
| TC-PO-003 | 3-way match success | GRN quantities match PO and invoice | Invoice cleared for payment | — |
| TC-PO-004 | 3-way match failure | GRN quantity differs from PO | Discrepancy flag raised; payment blocked | — |

---

## Module: User & RBAC

| TC ID | Test Case | Steps | Expected Result | Status |
|---|---|---|---|---|
| TC-RBAC-001 | Nurse cannot dispense | Login as nurse; attempt to access dispense API | 403 Forbidden returned | — |
| TC-RBAC-002 | Auditor read-only | Login as auditor; attempt stock adjustment | 403 Forbidden returned | — |
| TC-RBAC-003 | Admin creates user | Login as admin; create new pharmacist | User created; welcome email sent | — |

---

## Automation Scripts

Test automation is implemented using:
- **Unit/Integration:** Jest + Supertest (`/tests/unit/`, `/tests/integration/`)
- **E2E:** Playwright (`/tests/e2e/`)

Run all tests: `npm run test`
Run E2E tests: `npm run test:e2e`

---

*Owner: [QA Team]*
*Next Review: Per release cycle*
