# Stock Management Module Documentation
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

The Stock Management Module is the core of the PMS. It handles all stock movements: receiving, issuing, adjustments, returns, and disposals.

---

## 2. Stock Receiving (GRN)

### Trigger
A Purchase Order has been approved and goods have physically arrived.

### Process
1. Procurement officer opens the approved PO in the system.
2. Scans barcode / enters batch details (batch number, expiry date, quantity).
3. System validates against PO line items.
4. Discrepancies (quantity mismatch, unlisted items) are flagged.
5. System creates a **Goods Receipt Note (GRN)**.
6. Stock levels are updated; new batch records are created.
7. GRN is linked to supplier's invoice for payment processing.

### Business Rules
- Stock cannot be received against a non-approved PO.
- Items with expiry date < 6 months from today are rejected automatically with a warning.
- Cold chain items must have temperature log attached before acceptance.

---

## 3. Stock Issuing (Dispensing)

### Process
1. Pharmacist receives a prescription (physical or EHR-linked).
2. System validates prescription (signature, date, prescriber license).
3. System selects stock using **FEFO** (First Expiry, First Out) policy.
4. Pharmacist confirms item and quantity via barcode scan.
5. Stock is deducted; dispensing record is created.
6. Patient counseling notes are attached if configured.

### Business Rules
- Cannot dispense quantity exceeding available stock.
- Schedule X: Requires two pharmacist IDs for authorization.
- System blocks dispensing of expired batches.

---

## 4. Stock Adjustments

### Reason Codes
| Code | Description |
|---|---|
| BREAKAGE | Physical damage during handling |
| SPILLAGE | Liquid drug spilled |
| THEFT | Reported theft (triggers incident report) |
| DATA_ERROR | Correction of data entry mistake |
| EXPIRY_DISPOSAL | Disposal of expired stock |
| QUALITY_REJECT | Failed quality check |

### Authorization Levels
| Adjustment Qty | Approval Required |
|---|---|
| ≤ 10 units | Pharmacist self-approval |
| 11 – 50 units | Pharmacy Manager |
| > 50 units | Chief Pharmacist + documented evidence |

---

## 5. FEFO Policy

- **First Expiry, First Out** — the batch with the earliest expiry date is always selected first.
- System enforces FEFO automatically; manual batch override requires justification.
- Near-expiry batches (< 30 days) are highlighted in red in the UI.

---

## 6. Stock Valuation

- **Weighted Average Cost** method used for stock valuation.
- Monthly stock valuation reports auto-generated for finance team.

---

## 7. Physical Count Reconciliation

- Quarterly cycle count triggered by admin.
- System generates a count sheet (drug list with current system quantities hidden).
- Physical count entered; system shows variance.
- Variances > 2% require investigation before acceptance.

---

*Owner: [Pharmacy Operations Team]*
*Next Review: March 2027*
