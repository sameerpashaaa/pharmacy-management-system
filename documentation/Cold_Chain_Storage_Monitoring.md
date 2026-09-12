# Cold Chain / Storage Condition Monitoring Documentation
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

Temperature-sensitive drugs (vaccines, insulin, biologics, certain antibiotics) require strict cold chain management. This document describes how the PMS monitors and enforces storage condition compliance.

---

## 2. Drug Storage Classifications

| Classification | Temperature Range | Examples |
|---|---|---|
| Deep Freeze | -25°C to -15°C | Live attenuated vaccines |
| Refrigerated | +2°C to +8°C | Insulin, most vaccines, biologics |
| Cool | +8°C to +15°C | Some suppositories |
| Room Temperature | +15°C to +25°C | Most oral drugs |
| Controlled Room Temp | +20°C to +25°C | Stability-sensitive drugs |

Each drug in the master has a `storage_condition` field that maps to these classifications.

---

## 3. Temperature Sensor Integration

### Sensor Setup
- IoT temperature/humidity sensors installed in each cold storage unit.
- Sensors publish data via **MQTT** to a central broker every 5 minutes.
- PMS subscribes to sensor topics per storage location.

### Data Points Recorded
| Field | Description |
|---|---|
| location_id | Storage unit identifier |
| temperature | Current temperature (°C) |
| humidity | Current humidity (%) |
| timestamp | Reading time |
| sensor_status | ONLINE / OFFLINE / FAULT |

---

## 4. Alert Rules

| Condition | Alert Level | Action |
|---|---|---|
| Temperature out of range | 🔴 Critical | Immediate SMS + in-app to pharmacist + manager |
| Temperature approaching limit (±1°C) | ⚠️ Warning | In-app notification |
| Sensor offline > 15 minutes | ⚠️ Warning | Alert maintenance team |
| Door open > 5 minutes (if sensor enabled) | ⚠️ Warning | In-app notification |

---

## 5. Cold Chain Breach Handling

If a cold chain breach is detected:

1. System immediately quarantines all affected cold-sensitive batches.
2. Alert sent to pharmacist and manager.
3. **Pharmacist Assessment:**
   - Evaluate duration and extent of breach.
   - Consult WHO/manufacturer cold chain breach protocols.
   - Decide: Keep, Use Within X Hours, or Discard.
4. Decision and justification recorded in the system.
5. Supplier / insurer notified if breach occurred during delivery.

---

## 6. Receiving Cold Chain Items

During GRN:
1. Supplier must provide **temperature monitoring report** (data logger printout).
2. Log reviewed against acceptable excursion limits.
3. If acceptable: received into stock.
4. If unacceptable: batch rejected and supplier notified; RTV created.

---

## 7. Reporting

| Report | Frequency |
|---|---|
| Daily temperature log | Daily (auto-generated) |
| Cold chain breach log | Per event + Monthly summary |
| Sensor availability report | Weekly |
| Delivery temperature compliance | Per GRN |

---

*Owner: [Pharmacy Quality & Safety Team]*
*Next Review: March 2027*
