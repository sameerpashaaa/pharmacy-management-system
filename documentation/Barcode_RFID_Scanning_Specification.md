# Barcode / RFID Scanning Specification
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

The PMS supports barcode and RFID scanning for drug identification during stock receiving, dispensing, and physical inventory counts.

---

## 2. Supported Barcode Standards

| Standard | Usage |
|---|---|
| GS1-128 | Drug packages (batch, expiry, GTIN) |
| GS1 DataMatrix (2D) | Serialized drug units (unit-level tracking) |
| QR Code | Internal labels, supplier documents |
| Code 128 | Legacy labels |
| EAN-13 / UPC-A | Retail drug packaging |

### GS1 Application Identifiers (AIs) Used
| AI | Meaning |
|---|---|
| (01) | GTIN — Global Trade Item Number |
| (10) | Batch / Lot number |
| (17) | Expiry date (YYMMDD) |
| (21) | Serial number |

---

## 3. RFID Specification

- **Standard:** EPC Gen2 / ISO 18000-6C (UHF RFID)
- **Frequency:** 860–960 MHz
- **Tag type:** Passive RFID tags on drug cartons/pallets
- **Reader:** RFID reader with Ethernet/WiFi — exposes REST API endpoint

### RFID Gateway API
```
GET /rfid-gateway/reads
Response: [{ "epc": "E2804....", "rssi": -52, "timestamp": "..." }]
```

---

## 4. Scanning Hardware Requirements

| Device | Specification |
|---|---|
| Barcode scanner | USB HID class, supports GS1-128 and DataMatrix |
| RFID reader | UHF Gen2, network-connected, REST API |
| Mobile scanner (optional) | Android device with PMS mobile app |

---

## 5. Integration with PMS

### GRN (Receiving)
1. Operator scans barcode on drug carton.
2. System extracts GTIN, batch number, and expiry from GS1-128.
3. System auto-fills batch details in the receiving form.
4. Operator confirms quantity.

### Dispensing
1. Pharmacist scans barcode on drug pack.
2. System verifies: correct drug, correct batch, not expired.
3. If Schedule X: barcode scan required from both authorizing pharmacists.

### Physical Count
1. Operator scans all items in a storage location.
2. System reconciles scanned list against system inventory.
3. Discrepancies highlighted in real-time.

---

## 6. Error Handling

| Error | System Response |
|---|---|
| Unrecognized barcode | Alert user; allow manual entry |
| Expired batch scanned | Block action; show expiry alert |
| Recalled batch scanned | Block action; show recall notice |
| RFID reader offline | Fall back to manual/barcode entry; log offline event |

---

*Owner: [Technical Team / Pharmacy Operations]*
*Next Review: March 2027*
