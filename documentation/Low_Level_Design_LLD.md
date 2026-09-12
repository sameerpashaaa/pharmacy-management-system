# Low-Level Design (LLD) — Module-Level Design
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Authentication Module

### Classes / Services
- `AuthService` — handles login, logout, token generation
- `JWTHelper` — signs/verifies JWT tokens (HS256, 15-min expiry + refresh token)
- `PasswordHelper` — bcrypt hashing (cost factor 12)
- `RBACMiddleware` — checks permissions per route

### Key Methods
```js
AuthService.login(email, password) → { accessToken, refreshToken }
AuthService.refreshToken(token) → { accessToken }
AuthService.logout(userId) → void
RBACMiddleware.check(role, resource, action) → Boolean
```

---

## 2. Stock Management Module

### Classes / Services
- `StockService` — core inventory operations
- `StockRepository` — DB queries for stock table
- `AlertService` — triggers reorder/expiry alerts

### Key Methods
```js
StockService.receiveStock(payload) → StockEntry
StockService.issueStock(dispensingRequest) → DispensedRecord
StockService.adjustStock(adjustmentPayload) → AdjustmentLog
StockService.getStockLevel(drugId) → { quantity, batches[] }
AlertService.checkReorderLevels() → Alert[]
AlertService.checkExpiryDates(daysThreshold) → Alert[]
```

### Database Tables
- `drugs` — master drug list
- `stock` — current quantity per drug per location
- `batches` — batch no, expiry, supplier, received date
- `stock_transactions` — all movements (in/out/adjust)

---

## 3. Dispensing Module

### Classes / Services
- `DispensingService` — validates and processes drug issues
- `PrescriptionValidator` — checks prescription validity
- `NarcoticsGate` — dual-auth enforcement for Schedule X

### Key Methods
```js
DispensingService.dispense(prescriptionId, items[]) → DispensedRecord
PrescriptionValidator.validate(prescriptionId) → { valid, reason }
NarcoticsGate.requireDualAuth(drugId, auth1, auth2) → Boolean
```

---

## 4. Procurement Module

### Classes / Services
- `ProcurementService` — PO creation, approval workflow
- `SupplierService` — CRUD for supplier master
- `GRNService` — Goods Receipt Note processing

### Key Methods
```js
ProcurementService.createPO(items[], supplierId) → PurchaseOrder
ProcurementService.approvePO(poId, approverId) → PurchaseOrder
GRNService.receiveGoods(grnPayload) → GoodsReceiptNote
```

---

## 5. Reporting Module

### Classes / Services
- `ReportService` — generates all system reports
- `SchedulerService` — cron-based auto-report dispatch

### Reports
- Daily stock position report
- Near-expiry report (configurable threshold)
- Narcotic register (daily)
- Consumption report (weekly/monthly)
- Supplier performance report

---

## 6. Notification Module

### Flow
```
Alert Trigger → AlertService → NotificationQueue (Redis) → NotificationWorker → Email/SMS
```

- Transports: SendGrid (email), Twilio (SMS)
- In-app notifications via WebSocket (Socket.io)

---

*Author: [Lead Developer Name]*
*Next Review: March 2027*
