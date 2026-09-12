# Batch & Expiry Tracking Documentation
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Purpose

This document describes how the PMS tracks pharmaceutical batches and enforces expiry management to prevent dispensing of expired or near-expiry drugs.

---

## 2. Batch Data Captured

Every batch record stores:
- Batch number (from manufacturer)
- Manufacturing date
- Expiry date
- Supplier
- Quantity received
- Storage condition
- Receiving date
- Linked Purchase Order / GRN

---

## 3. Expiry Alert Thresholds

| Threshold | Alert Level | Action |
|---|---|---|
| 90 days to expiry | ℹ️ Informational | Dashboard flag, weekly email digest |
| 60 days to expiry | ⚠️ Warning | In-app notification + email to pharmacist |
| 30 days to expiry | 🔴 Critical | SMS + email to pharmacist + manager |
| Expired | ❌ Blocked | Dispensing blocked; disposal queue created |

---

## 4. FEFO Enforcement

- When dispensing, system automatically selects the batch with the **earliest expiry date**.
- Pharmacist can override batch selection but must provide a justification reason code.
- All FEFO overrides are logged in the audit trail.

---

## 5. Expired Stock Handling

1. System automatically flags expired batches as `EXPIRED`.
2. Expired batches are removed from available stock display.
3. A **Disposal Queue** is created listing all expired items.
4. Disposal must be witnessed and documented (two-person sign-off).
5. Disposal records are retained for regulatory compliance.

---

## 6. Batch Recall Management

When a manufacturer issues a recall:

1. Admin enters the recall notice (batch number, drug name, recall reason).
2. System quarantines all units of the affected batch automatically.
3. System generates a list of patients who received the batch (if dispensed).
4. Notification sent to clinical team for patient follow-up.
5. Return-to-supplier initiated for quarantined stock.
6. Recall event is logged with all actions taken.

---

## 7. Reporting

| Report | Frequency | Audience |
|---|---|---|
| Near-expiry stock list | Daily | Pharmacist, Manager |
| Expired stock disposal log | Monthly | Compliance Officer |
| Batch recall tracker | Per event | Pharmacy Manager, Clinical Team |
| FEFO override audit | Weekly | Pharmacy Manager |

---

*Owner: [Pharmacy Compliance Team]*
*Next Review: March 2027*
