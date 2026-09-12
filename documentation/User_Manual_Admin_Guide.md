# User Manual & Admin Guide
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## Part 1: Getting Started

### 1.1 Logging In
1. Open your browser and go to `https://pms.yourhospital.com`.
2. Enter your **Email Address** and **Password**.
3. Click **Sign In**.
4. If prompted, enter your MFA code from your authenticator app.

### 1.2 Dashboard Overview
After login, you'll see the main dashboard with:
- **Stock Alerts** — Low stock and near-expiry warnings.
- **Quick Actions** — Dispense, Receive Stock, Create PO.
- **Recent Activity** — Last 10 transactions.
- **Today's Summary** — Dispensing count, GRNs received, pending approvals.

---

## Part 2: Pharmacist Guide

### 2.1 Dispensing a Drug
1. Click **Dispense** from the dashboard or sidebar.
2. Enter or scan the **Prescription ID**.
3. System validates the prescription automatically.
4. Review the auto-selected drug and batch (FEFO applied).
5. Verify quantity and confirm by clicking **Dispense**.
6. A dispensing receipt is generated automatically.

> For Schedule X drugs: two pharmacists must both enter their IDs before dispensing is allowed.

### 2.2 Receiving Stock (GRN)
1. Go to **Procurement → Goods Receipt**.
2. Select the Purchase Order from the list.
3. Scan each item's barcode OR manually enter batch details.
4. Enter quantity received.
5. Click **Submit GRN**.

### 2.3 Viewing Stock Levels
- Navigate to **Stock → Current Stock** to see all drugs with quantities and batch expiry dates.
- Use filters: Drug name, category, schedule, or location.

### 2.4 Stock Adjustments
1. Go to **Stock → Adjustments**.
2. Search for the drug.
3. Enter the adjustment quantity (negative for reduction).
4. Select reason code and add notes.
5. Click **Submit** (large adjustments require manager approval).

---

## Part 3: Admin Guide

### 3.1 Managing Users
1. Go to **Settings → Users**.
2. Click **Add User**.
3. Fill in name, email, role, and license number (for pharmacists).
4. User receives a welcome email with a password setup link.

### 3.2 Managing Drug Master
1. Go to **Drugs → Drug Master**.
2. Click **Add Drug** to create a new entry.
3. Fill in: Name, form, schedule, storage condition, reorder level.

### 3.3 Managing Suppliers
1. Go to **Procurement → Suppliers**.
2. Click **Add Supplier** to register a new supplier.
3. Enter drug license number, contact details, and approved drug schedules.
4. Activate the supplier by clicking **Approve**.

### 3.4 Approving Purchase Orders
1. Go to **Procurement → Purchase Orders**.
2. Filter by status: **Pending Approval**.
3. Review PO details and line items.
4. Click **Approve** or **Reject** with a comment.

### 3.5 Viewing Audit Logs
1. Go to **Reports → Audit Trail**.
2. Filter by date range, user, action type, or drug.
3. Export to CSV for compliance purposes.

---

## Part 4: Common Tasks (All Roles)

| Task | Path |
|---|---|
| View my profile | Top-right avatar → Profile |
| Change password | Profile → Change Password |
| View notifications | Bell icon (top right) |
| Generate report | Reports → [Report Type] |
| View drug alerts | Dashboard → Stock Alerts |

---

*Maintained by: [System Administrator]*
*Next Update: Per software release*
