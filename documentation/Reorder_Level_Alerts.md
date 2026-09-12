# Reorder Level & Alerts Documentation
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

This document describes how the PMS manages reorder levels, triggers stock replenishment alerts, and assists procurement decisions.

---

## 2. Reorder Level Configuration

Each drug in the system has:
- **Reorder Level (ROL):** Stock quantity that triggers a reorder alert.
- **Minimum Stock Level (MSL):** Critical minimum; dispensing generates a warning.
- **Maximum Stock Level:** Target after replenishment.
- **Economic Order Quantity (EOQ):** Suggested order quantity (configurable).

These parameters are set per drug per location (ward/store).

---

## 3. Alert Types

| Alert Type | Trigger | Urgency |
|---|---|---|
| Reorder Alert | Stock ≤ Reorder Level | Medium — procurement action needed |
| Critical Low Stock | Stock ≤ Minimum Stock Level | High — urgent procurement |
| Stockout Alert | Stock = 0 | Critical — immediate action |
| Overstock Alert | Stock > Maximum Stock Level | Low — reduce future orders |

---

## 4. Alert Delivery

| Alert Level | In-App | Email | SMS |
|---|---|---|---|
| Reorder | ✅ | ✅ | ❌ |
| Critical Low | ✅ | ✅ | ✅ |
| Stockout | ✅ | ✅ | ✅ |
| Overstock | ✅ | ❌ | ❌ |

Recipients: Pharmacist, Procurement Officer, Pharmacy Manager.

---

## 5. Auto-Reorder (Optional Feature)

When enabled for a drug:
1. System detects stock ≤ Reorder Level.
2. System auto-generates a Draft Purchase Order with EOQ.
3. Procurement officer reviews and approves (manual approval always required).
4. PO sent to preferred supplier.

---

## 6. Consumption-Based Reorder Calculation

The system calculates the **Average Daily Consumption (ADC)** over the last 30 days:

```
ADC = Total Units Dispensed in Last 30 Days / 30
Lead Time Days = Configured per supplier
Reorder Point = ADC × Lead Time Days + Safety Stock
```

Admins can accept system-calculated reorder points or override manually.

---

## 7. Dashboard Display

- A dedicated **"Low Stock & Alerts"** dashboard widget shows:
  - All drugs below reorder level (sorted by urgency).
  - Days of stock remaining estimate.
  - Quick-action button: "Create PO."

---

*Owner: [Pharmacy Procurement Team]*
*Next Review: March 2027*
