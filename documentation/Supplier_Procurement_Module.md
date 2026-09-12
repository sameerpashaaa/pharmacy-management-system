# Supplier & Procurement Module Documentation
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

This module manages the end-to-end procurement lifecycle: supplier management, purchase orders, goods receipt, and invoice reconciliation.

---

## 2. Supplier Master Management

### Supplier Registration
Required fields:
- Company name, contact person, phone, email
- Drug license number (verified against regulatory database)
- Drug schedules the supplier is authorized to supply
- Bank details (for payment processing)
- Approved/blacklisted status

### Supplier Approval Workflow
```
Supplier submits details → Procurement Officer reviews → Admin approves
→ Supplier activated → Eligible for PO creation
```

### Supplier Rating (auto-calculated)
| Metric | Weight |
|---|---|
| On-time delivery rate | 40% |
| Quality rejection rate | 30% |
| Price competitiveness | 20% |
| Invoice accuracy | 10% |

---

## 3. Purchase Order (PO) Lifecycle

```
DRAFT → PENDING_APPROVAL → APPROVED → SENT_TO_SUPPLIER → PARTIALLY_RECEIVED → RECEIVED → CLOSED
                                                                                      │
                                                                                 CANCELLED
```

### PO Creation Rules
- Only approved suppliers can be selected.
- Line items must reference drugs from the drug master.
- For Schedule X drugs: Procurement Head approval required.
- Budget check against department allocation (if ERP integrated).

---

## 4. Goods Receipt Note (GRN) Process

1. Delivery arrives; GRN is created against the PO.
2. Items scanned and quantities verified.
3. Cold chain items: temperature log must be attached.
4. Quality inspection: sample check (configurable per drug category).
5. GRN approved → stock levels updated → invoice generated for payment.
6. Discrepancies documented in **Goods Receipt Discrepancy Report**.

---

## 5. Three-Way Matching

Before payment is released, the system performs **3-way matching**:
- Purchase Order ↔ Goods Receipt Note ↔ Supplier Invoice

All three must match within a configured tolerance (e.g., ±2%). Mismatches are flagged for manual resolution.

---

## 6. Reports

| Report | Description |
|---|---|
| Pending POs | POs not yet received |
| Supplier Performance | Delivery rate, quality issues |
| Spend Analysis | Procurement spend by drug/supplier |
| GRN Discrepancy Log | Quantity/quality mismatches |
| Pending Invoice Payments | For finance team |

---

*Owner: [Procurement Team]*
*Next Review: March 2027*
