# Standard Operating Procedures (SOPs) — Inventory Handling
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## SOP-001: Receiving New Stock

### Purpose
Ensure all incoming pharmaceutical stock is accurately received, verified, and recorded.

### Procedure
1. Receive delivery from supplier with accompanying invoice/purchase order.
2. Verify quantity and item description against the PO in the system.
3. Inspect packaging for damage, tampering, or temperature excursions (cold chain).
4. Scan barcodes/RFID tags to register batch numbers and expiry dates.
5. Record the receiving event in the PMS (user ID, timestamp, batch, quantity).
6. Store items in designated storage zones per storage conditions.
7. Reject and quarantine any non-conforming items; raise a discrepancy report.

---

## SOP-002: Issuing Medicines

### Purpose
Ensure medicines are issued accurately to the correct patient/ward with full traceability.

### Procedure
1. Receive a dispensing request (from prescription or ward requisition).
2. Verify the request against the physician's prescription in the system.
3. Select the stock with the **earliest expiry date** (FEFO — First Expiry, First Out).
4. Scan the barcode to confirm drug, batch, and quantity.
5. Record the issue in the PMS with patient ID, ward, user ID, and timestamp.
6. For controlled substances: obtain dual authorization before dispensing.
7. Provide patient counseling notes if applicable.

---

## SOP-003: Stock Adjustment

### Purpose
Correct stock discrepancies discovered during physical counts or investigations.

### Procedure
1. Identify the discrepancy (physical count vs. system quantity).
2. Document the reason (breakage, theft, spillage, data entry error).
3. Enter adjustment in the PMS with justification code.
4. Supervisor approval required for adjustments exceeding ±10 units.
5. All adjustments are logged in the audit trail automatically.

---

## SOP-004: Handling Near-Expiry Stock

1. System generates alerts for items expiring within 90, 60, and 30 days.
2. Pharmacist reviews near-expiry list weekly.
3. Prioritize near-expiry items for issue (FEFO).
4. Items within 30 days of expiry are flagged for return to supplier or disposal.
5. Record disposal with witnessed sign-off.

---

## SOP-005: Physical Inventory Count

1. Conduct full physical inventory quarterly.
2. Reconcile physical count against PMS records.
3. Document and investigate all variances > 2%.
4. Update system with verified counts and attach count sheet as evidence.

---

*Approved by: [Pharmacy Manager]*
*Next Review Date: March 2027*
