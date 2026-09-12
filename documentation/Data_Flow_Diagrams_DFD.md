# Data Flow Diagrams (DFD)
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## Level 0 — Context Diagram

```
                    ┌─────────────────────┐
  Pharmacist ──────►│                     │──────► Patient/Ward
  Nurse ───────────►│  Pharmacy           │
  Admin ───────────►│  Management         │──────► Supplier
  Procurement ─────►│  System (PMS)       │
  Supplier ────────►│                     │──────► Regulatory Reports
  EHR/EMR ─────────►│                     │
                    └─────────────────────┘
```

---

## Level 1 — Main Processes

```
Pharmacist ──► [1.0 Authenticate] ──► Session Token
                                         │
               ┌─────────────────────────┘
               ▼
Prescription ──► [2.0 Dispensing] ──► Dispensing Record
                        │
                        ▼
                 [Stock DB] ◄──── [3.0 Stock Management]
                                         │
              GRN/Receipt ──────────────►│
              Stock Adjust ─────────────►│
                                         │
                                         ▼
                              [4.0 Expiry & Alert Engine]
                                         │
                        ┌────────────────┼────────────────┐
                        ▼                ▼                 ▼
                 Expiry Alerts    Reorder Alerts    Low Stock Alerts
                        │
                        ▼
              [5.0 Procurement] ──► PO ──► Supplier
                        │
                        ▼
              [6.0 Reporting] ──► Regulatory Reports
                                 └──► Internal Reports
```

---

## Level 2 — Dispensing Process

```
Pharmacist ──► Enter Prescription ID
                        │
                        ▼
              [Validate Prescription] ──INVALID──► Error Response
                        │ VALID
                        ▼
              [Check Drug Schedule]
                   │            │
                Schedule X    Others
                   │            │
                   ▼            ▼
          [Dual Auth Gate]  [Select Batch (FEFO)]
                   │            │
                   └─────┬──────┘
                         ▼
                [Deduct Stock in DB]
                         │
                         ▼
                [Write Audit Log]
                         │
                         ▼
                [Generate Dispensing Receipt]
                         │
                         ▼
                [Update Patient Record / EHR]
```

---

## Level 2 — Stock Receiving Process

```
Supplier ──► Delivery + Invoice
                    │
                    ▼
        [Match to Purchase Order]──MISMATCH──► Flag Discrepancy
                    │ MATCH
                    ▼
        [Inspect Items: Qty, Expiry, Condition]
                    │
            ┌───────┴────────┐
         PASS              FAIL
            │                │
            ▼                ▼
    [Scan Barcodes]    [Quarantine Batch]
            │                │
            ▼                ▼
    [Create Batch     [Notify Procurement]
     Record in DB]
            │
            ▼
    [Update Stock Levels]
            │
            ▼
    [Generate GRN / Write Audit Log]
```

---

## Level 2 — Expiry Alert Process

```
[Scheduler: Daily Cron at 00:00]
              │
              ▼
    [Query batches WHERE expiry_date <= NOW() + 90 days]
              │
    ┌─────────┴──────────────┐
  30 days              60-90 days
    │                        │
    ▼                        ▼
[Critical Alert]       [Warning Alert]
    │                        │
    ├──► In-app notification  ├──► In-app notification
    ├──► Email to Pharmacist  ├──► Email to Pharmacist
    └──► SMS to Manager       └──► Dashboard flag
```

---

*Author: [System Analyst]*
*Next Review: March 2027*
