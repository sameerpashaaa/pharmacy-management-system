# Database Design Document / ER Diagrams
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

The PMS uses **PostgreSQL** as the primary relational database. All tables include `created_at`, `updated_at`, and `created_by` audit columns.

---

## 2. Core Entities

### 2.1 `drugs` — Drug Master
| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique drug ID |
| name | VARCHAR(255) | Generic name |
| brand_name | VARCHAR(255) | Brand/trade name |
| form | VARCHAR(50) | Tablet, Capsule, Injection, etc. |
| strength | VARCHAR(50) | e.g., 500mg |
| category | VARCHAR(50) | Antibiotic, Analgesic, etc. |
| schedule | ENUM | OTC, H, H1, X, G |
| unit | VARCHAR(20) | Strip, Vial, Bottle, etc. |
| reorder_level | INTEGER | Minimum stock trigger |
| storage_condition | VARCHAR(100) | Room temp / Cold chain |
| is_active | BOOLEAN | Soft delete flag |

### 2.2 `batches` — Batch & Expiry
| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique batch ID |
| drug_id | UUID FK | References drugs |
| batch_number | VARCHAR(100) | Manufacturer batch no. |
| expiry_date | DATE | Expiry date |
| manufacture_date | DATE | Manufacturing date |
| supplier_id | UUID FK | References suppliers |
| quantity_received | INTEGER | Units received |
| unit_cost | DECIMAL(10,2) | Cost per unit |
| received_at | TIMESTAMP | GRN timestamp |

### 2.3 `stock` — Current Stock Levels
| Column | Type | Description |
|---|---|---|
| id | UUID PK | Unique stock record |
| drug_id | UUID FK | References drugs |
| location_id | UUID FK | References locations/wards |
| batch_id | UUID FK | References batches |
| quantity | INTEGER | Current available quantity |

### 2.4 `stock_transactions` — All Movements
| Column | Type | Description |
|---|---|---|
| id | UUID PK | Transaction ID |
| drug_id | UUID FK | References drugs |
| batch_id | UUID FK | References batches |
| transaction_type | ENUM | RECEIVE, ISSUE, ADJUST, RETURN, DISPOSE |
| quantity | INTEGER | Quantity moved (positive/negative) |
| reference_id | UUID | Linked dispensing/PO/GRN ID |
| performed_by | UUID FK | References users |
| timestamp | TIMESTAMP | Event time |
| notes | TEXT | Reason / remarks |

### 2.5 `suppliers` — Supplier Master
| Column | Type | Description |
|---|---|---|
| id | UUID PK | Supplier ID |
| name | VARCHAR(255) | Supplier name |
| license_number | VARCHAR(100) | Drug license no. |
| contact_email | VARCHAR(255) | — |
| contact_phone | VARCHAR(20) | — |
| address | TEXT | — |
| is_approved | BOOLEAN | Approval status |
| drug_schedules | TEXT[] | Schedules they can supply |

### 2.6 `users` — System Users
| Column | Type | Description |
|---|---|---|
| id | UUID PK | User ID |
| name | VARCHAR(255) | Full name |
| email | VARCHAR(255) UNIQUE | Login email |
| password_hash | TEXT | Bcrypt hash |
| role | ENUM | admin, pharmacist, nurse, procurement, auditor |
| license_number | VARCHAR(100) | Pharmacist license |
| is_active | BOOLEAN | — |

### 2.7 `purchase_orders` — Procurement
| Column | Type | Description |
|---|---|---|
| id | UUID PK | PO ID |
| supplier_id | UUID FK | References suppliers |
| status | ENUM | DRAFT, PENDING, APPROVED, RECEIVED, CANCELLED |
| total_amount | DECIMAL(12,2) | — |
| approved_by | UUID FK | References users |
| expected_delivery | DATE | — |

### 2.8 `dispensing_records` — Dispensing
| Column | Type | Description |
|---|---|---|
| id | UUID PK | Dispensing record ID |
| prescription_id | VARCHAR(100) | Linked prescription |
| patient_id | VARCHAR(100) | Patient identifier |
| ward_id | UUID FK | References locations |
| dispensed_by | UUID FK | References users |
| authorized_by | UUID FK | For Schedule X |
| dispensed_at | TIMESTAMP | — |

---

## 3. ER Diagram (Textual)

```
drugs ────< batches ────< stock
  │                          │
  └──< stock_transactions >──┘
  
suppliers ────< purchase_orders ────< po_line_items ────> drugs

users ────< dispensing_records ────< dispensed_items ────> batches
```

---

## 4. Indexes

```sql
CREATE INDEX idx_batches_expiry ON batches(expiry_date);
CREATE INDEX idx_stock_drug_location ON stock(drug_id, location_id);
CREATE INDEX idx_transactions_drug ON stock_transactions(drug_id, timestamp);
CREATE INDEX idx_users_email ON users(email);
```

---

*Author: [Database Architect]*
*Next Review: March 2027*
