# UML Diagrams
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Class Diagram (Core Domain)

```
┌──────────────────────────────────┐
│             Drug                 │
├──────────────────────────────────┤
│ + id: UUID                       │
│ + name: string                   │
│ + form: DrugForm                 │
│ + schedule: DrugSchedule         │
│ + reorderLevel: number           │
│ + storageCondition: string       │
├──────────────────────────────────┤
│ + getBatches(): Batch[]          │
│ + getCurrentStock(): StockLevel[]│
└──────────┬───────────────────────┘
           │ 1..*
┌──────────▼───────────────────────┐
│             Batch                │
├──────────────────────────────────┤
│ + id: UUID                       │
│ + batchNumber: string            │
│ + expiryDate: Date               │
│ + quantityReceived: number       │
│ + unitCost: number               │
├──────────────────────────────────┤
│ + isExpired(): boolean           │
│ + daysToExpiry(): number         │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│        StockTransaction          │
├──────────────────────────────────┤
│ + id: UUID                       │
│ + type: TransactionType          │
│ + quantity: number               │
│ + timestamp: Date                │
│ + performedBy: User              │
│ + notes: string                  │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│             User                 │
├──────────────────────────────────┤
│ + id: UUID                       │
│ + name: string                   │
│ + role: UserRole                 │
│ + licenseNumber: string          │
├──────────────────────────────────┤
│ + canDispense(): boolean         │
│ + canApprovePO(): boolean        │
└──────────────────────────────────┘
```

---

## 2. Sequence Diagram — Drug Dispensing

```
Pharmacist    DispensingService    PrescriptionValidator    StockService    AuditService
    │                │                     │                    │               │
    │──dispense()───►│                     │                    │               │
    │                │──validate()────────►│                    │               │
    │                │◄──{valid}──────────│                    │               │
    │                │──checkSchedule()───►│                    │               │
    │                │◄──{schedule}───────│                    │               │
    │                │                     │                    │               │
    │                │──issueStock()──────────────────────────►│               │
    │                │◄──{issued}─────────────────────────────│               │
    │                │                     │                    │               │
    │                │──log()────────────────────────────────────────────────►│
    │                │◄──{logged}─────────────────────────────────────────────│
    │◄──receipt──────│                     │                    │               │
```

---

## 3. Activity Diagram — Purchase Order Approval

```
[Start]
   │
   ▼
Procurement creates draft PO
   │
   ▼
Add line items (drugs, quantities, supplier)
   │
   ▼
Submit PO for approval
   │
   ▼
Admin receives notification
   │
   ▼
[Review PO] ──REJECT──► Notify Procurement → [End]
   │ APPROVE
   ▼
PO status = APPROVED
   │
   ▼
Send PO to Supplier (email/API)
   │
   ▼
[Await Delivery]
   │
   ▼
Goods received → Create GRN
   │
   ▼
PO status = RECEIVED → [End]
```

---

## 4. Use Case Diagram (Text Representation)

**Actors:** Pharmacist, Nurse, Admin, Procurement Officer, Supplier, Auditor

| Actor | Use Cases |
|---|---|
| Pharmacist | Receive stock, Dispense drugs, Adjust stock, View alerts, Generate reports |
| Nurse | Request drugs, View dispensing history |
| Admin | Manage users, Manage drug master, Approve POs, View audit logs |
| Procurement | Create PO, Manage suppliers, Process GRN |
| Supplier | Receive PO, Submit invoices |
| Auditor | View audit trails, Export compliance reports |

---

*Author: [System Analyst / Architect]*
*Next Review: March 2027*
