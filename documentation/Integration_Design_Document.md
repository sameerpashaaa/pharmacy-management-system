# Integration Design Document
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

This document describes all external system integrations for the PMS, including EHR/EMR, billing, supplier APIs, barcode/RFID, and notification gateways.

---

## 2. Integration Inventory

| Integration | Type | Protocol | Direction |
|---|---|---|---|
| EHR/EMR System | Patient & prescription data | REST / HL7 FHIR | Bidirectional |
| Supplier API | PO transmission, GRN | REST / EDI | Outbound |
| Billing / ERP | Invoice, financial sync | REST / SOAP | Outbound |
| Barcode Scanner | Drug scanning at GRN & dispensing | USB HID / WebHID API | Inbound |
| RFID Reader | Asset/drug tracking | REST (reader gateway) | Inbound |
| SMS Gateway | Alert notifications | Twilio REST API | Outbound |
| Email Gateway | Reports, alerts | SendGrid REST API | Outbound |
| Cold Chain Sensors | Temperature monitoring | MQTT / REST Webhook | Inbound |
| Regulatory Portal | Controlled substance reporting | REST / SFTP | Outbound |

---

## 3. EHR/EMR Integration

### Purpose
- Pull valid prescription data to authorize dispensing.
- Push dispensing records back to patient's EHR.

### Protocol
- **HL7 FHIR R4** over HTTPS.
- Resources used: `MedicationRequest`, `MedicationDispense`, `Patient`.

### Flow
```
EHR creates Prescription (MedicationRequest)
        │
        ▼
PMS pulls MedicationRequest by ID on dispensing request
        │
        ▼
PMS validates → Dispenses → Creates MedicationDispense
        │
        ▼
PMS pushes MedicationDispense back to EHR
```

### Authentication
- OAuth 2.0 Client Credentials flow with EHR authorization server.

---

## 4. Supplier API Integration

### Purpose
- Transmit Purchase Orders electronically.
- Receive e-invoices and delivery confirmations.

### Protocol
- REST API (supplier-specific) or EDI 850/856/810 via VAN.

### Flow
```
PMS generates approved PO → POST /supplier-api/orders
Supplier confirms → Webhook to PMS /webhooks/supplier/delivery
PMS creates GRN from delivery confirmation
```

---

## 5. Barcode / RFID Integration

### Barcode
- Standard: **GS1-128** and **QR Code** on drug packages.
- Hardware: USB barcode scanners (HID class) — no driver needed.
- Browser integration: WebHID API or wired input to text field.

### RFID
- Standard: **EPC Gen2 / ISO 18000-6C**.
- Reader connects to a local gateway that exposes a REST endpoint.
- PMS polls or receives webhooks from the gateway.

---

## 6. Cold Chain / Temperature Sensor Integration

### Protocol
- Sensors publish temperature readings via **MQTT** to a broker.
- PMS subscribes to broker topics per storage location.

### Alert Rule
```
IF temperature > max_threshold OR temperature < min_threshold
  THEN create COLD_CHAIN_BREACH alert
  AND notify Pharmacy Manager via SMS + in-app
```

---

## 7. Billing / ERP Integration

- On GRN creation: POST invoice data to ERP `/api/invoices`
- On dispensing: POST consumption data to ERP for cost allocation
- Authentication: API Key in header

---

## 8. Error Handling & Retry

- All outbound API calls use **exponential backoff** (3 retries, max 60s delay).
- Failed webhook deliveries are stored in `integration_failures` table.
- Daily reconciliation job checks for unsynced records.

---

*Author: [Integration Architect]*
*Next Review: March 2027*
