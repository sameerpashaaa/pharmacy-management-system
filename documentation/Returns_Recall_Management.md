# Returns & Recall Management Documentation
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Returns Management

### 1.1 Patient Returns
A patient may return unused medication in certain circumstances.

**Return Conditions:**
- Prescription changed by physician.
- Patient admitted to ward (outpatient medication returned).
- Over-dispensing error.

**Process:**
1. Pharmacist initiates a return transaction in PMS.
2. Physical condition of returned items inspected.
3. If acceptable: stock re-credited to inventory (with notation).
4. If not acceptable: items sent to disposal queue.
5. Return reason code and notes recorded in audit trail.

**Business Rules:**
- Schedule X (controlled substances) cannot be re-stocked after return — must go to disposal.
- Returns older than 7 days from dispensing require manager approval.

### 1.2 Supplier Returns
Returning goods to supplier due to:
- Quality failures / damaged packaging
- Wrong items delivered
- Near-expiry items (under supplier agreement)

**Process:**
1. Create a Return to Vendor (RTV) document in the system.
2. Link to original GRN.
3. Print return note; ship goods to supplier.
4. Supplier issues credit note; PMS records credit against supplier account.

---

## 2. Drug Recall Management

### 2.1 Recall Types
| Type | Description |
|---|---|
| Class I | Most serious — may cause death/serious harm |
| Class II | May cause temporary adverse effects |
| Class III | Unlikely to cause harm but violates regulations |

### 2.2 Recall Process

```
[Regulatory Recall Notice Received]
              │
              ▼
Admin enters recall details:
- Drug name, batch number(s), manufacturer
- Recall reason, recall class
- Return instructions
              │
              ▼
System auto-quarantines all matching batches
              │
              ▼
Generate Patient Impact List
(list of patients dispensed the recalled batch)
              │
              ▼
Notify clinical team for patient follow-up
              │
              ▼
Initiate Return to Supplier / Regulatory Destruction
              │
              ▼
Document all actions → Recall Closure Report
```

### 2.3 Recall Tracking Dashboard
- Open recalls with batch, quantity, and disposition status.
- Patient impact count.
- % of recalled stock recovered.
- Days since recall initiated.

### 2.4 Regulatory Reporting
- Recall acknowledgment submitted to CDSCO / FDA within 24 hours.
- Final recall closure report generated upon completion.

---

*Owner: [Pharmacy Compliance & Quality Team]*
*Next Review: March 2027*
