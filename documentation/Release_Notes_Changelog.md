# Release Notes / Changelog
**Pharmacy Management System**
*Maintained in reverse chronological order (latest first)*

---

## [v1.0.0] — September 2026 — Initial Release 🎉

### New Features
- **Stock Management:** Complete receiving, issuing, and adjustment workflows with FEFO enforcement.
- **Dispensing Module:** Prescription-linked dispensing with barcode scan verification.
- **Schedule X (Controlled Substances):** Dual authorization enforcement with narcotic register.
- **Batch & Expiry Tracking:** Automated alerts at 90/60/30-day thresholds. Dispensing of expired batches blocked.
- **Procurement Module:** Full PO lifecycle (draft → approve → GRN) with 3-way matching.
- **Supplier Management:** Supplier master with drug schedule approval controls.
- **Cold Chain Monitoring:** MQTT sensor integration with breach alerts.
- **RBAC:** Five roles — admin, pharmacist, nurse, procurement, auditor.
- **Audit Trail:** Tamper-evident, append-only log for all transactions.
- **Drug Recall Management:** Batch quarantine and patient impact reporting.
- **Returns Management:** Patient returns and Return-to-Vendor workflows.
- **Reporting:** Stock position, near-expiry, narcotic register, consumption reports.
- **EHR Integration:** HL7 FHIR R4 — prescription pull and dispensing push.
- **Notifications:** In-app, email (SendGrid), and SMS (Twilio) alerts.

### Known Issues
- Cold chain sensor integration requires manual MQTT broker configuration (documented in Integration Design Document).
- EHR integration setup requires coordination with EHR vendor for OAuth credentials.

---

## Upcoming in v1.1.0 (Planned — Q1 2027)

- Mobile app for barcode scanning (Android/iOS).
- Auto-reorder Purchase Order generation.
- Advanced analytics dashboard (consumption trends, waste analysis).
- RFID reader integration.
- Multi-location / multi-store support.
- Supplier portal for e-invoicing.

---

*Maintained by: [Development Team]*
*Format follows: [Keep a Changelog](https://keepachangelog.com)*
