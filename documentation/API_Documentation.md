# API Documentation
**Pharmacy Management System — REST API Specification**
*Version: 1.0 | Base URL: `https://api.pms.example.com/v1`*

---

## Authentication

All endpoints require a Bearer token in the `Authorization` header unless marked `[Public]`.

```
Authorization: Bearer <JWT_ACCESS_TOKEN>
```

### POST /auth/login `[Public]`
Login and receive tokens.

**Request:**
```json
{ "email": "pharmacist@hospital.com", "password": "secure123" }
```
**Response `200`:**
```json
{ "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }
```

### POST /auth/refresh `[Public]`
Refresh access token.

**Request:** `{ "refreshToken": "..." }`
**Response `200`:** `{ "accessToken": "..." }`

### POST /auth/logout
Invalidate session.

---

## Drugs

### GET /drugs
List all drugs with optional filters.

**Query Params:** `?schedule=H&category=Antibiotic&search=amoxicillin&page=1&limit=20`

**Response `200`:**
```json
{
  "data": [{ "id": "uuid", "name": "Amoxicillin", "form": "Capsule", "schedule": "H" }],
  "total": 120, "page": 1, "limit": 20
}
```

### POST /drugs `[admin, pharmacist]`
Create a new drug entry.

### GET /drugs/:id
Get drug details including current stock and batches.

### PATCH /drugs/:id `[admin]`
Update drug master details.

---

## Stock

### GET /stock
Get current stock levels across all locations.

**Query Params:** `?drugId=uuid&locationId=uuid&belowReorder=true`

### POST /stock/receive `[pharmacist, procurement]`
Record stock receipt (GRN).

**Request:**
```json
{
  "supplierId": "uuid",
  "poId": "uuid",
  "items": [{ "drugId": "uuid", "batchNumber": "B001", "expiryDate": "2027-06-30", "quantity": 100, "unitCost": 12.50 }]
}
```

### POST /stock/issue `[pharmacist, nurse]`
Dispense drugs against a prescription.

**Request:**
```json
{
  "prescriptionId": "RX-12345",
  "patientId": "P-9001",
  "wardId": "uuid",
  "items": [{ "drugId": "uuid", "batchId": "uuid", "quantity": 10 }]
}
```

### POST /stock/adjust `[pharmacist]`
Adjust stock quantity with reason.

**Request:**
```json
{ "drugId": "uuid", "batchId": "uuid", "adjustmentQty": -5, "reason": "BREAKAGE", "notes": "Vials broken during handling" }
```

---

## Procurement

### GET /purchase-orders
List purchase orders. Filter: `?status=PENDING&supplierId=uuid`

### POST /purchase-orders `[procurement]`
Create a new PO.

### PATCH /purchase-orders/:id/approve `[admin]`
Approve a pending PO.

### GET /suppliers
List all approved suppliers.

### POST /suppliers `[admin]`
Add a new supplier.

---

## Alerts

### GET /alerts
Get active alerts.

**Response `200`:**
```json
[
  { "id": "uuid", "type": "EXPIRY_WARNING", "drugId": "uuid", "drugName": "Insulin", "expiryDate": "2026-10-01", "quantity": 50 },
  { "id": "uuid", "type": "REORDER", "drugId": "uuid", "drugName": "Paracetamol", "currentStock": 20, "reorderLevel": 50 }
]
```

---

## Reports

### GET /reports/stock-position
Daily stock position report (CSV/JSON).

### GET /reports/near-expiry?days=30
Drugs expiring within N days.

### GET /reports/consumption?from=2026-08-01&to=2026-08-31
Consumption report for date range.

### GET /reports/narcotic-register?date=2026-09-12
Daily narcotic drug register.

---

## Error Codes

| Code | Meaning |
|---|---|
| 400 | Bad Request — validation failed |
| 401 | Unauthorized — missing/invalid token |
| 403 | Forbidden — insufficient role |
| 404 | Resource not found |
| 409 | Conflict — duplicate entry |
| 422 | Unprocessable — business rule violation |
| 500 | Internal server error |

---

*Maintained by: [Backend Team]*
