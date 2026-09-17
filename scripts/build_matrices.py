def get_matrices():
    return """# Cross-Product Feature Matrix

The following comprehensive matrix evaluates all seven platforms across fundamental enterprise and trade capabilities:

| Feature / Domain | TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Double-Entry General Ledger** | Available | Available | Available | Not Available (Single-entry) | Available | Not Available (Single-entry) | Available |
| **Hierarchical Chart of Accounts** | Available | Available | Available | Not Available | Available | Not Available | Available |
| **Bank Reconciliation (BRS)** | Available (Direct API) | Available (Auto/Manual) | Available (Direct API) | Partially Available (Manual) | Available (Semi-auto) | Partially Available (Manual) | Available (MargPay API) |
| **MCA-Compliant Edit Log** | Available (Edit Log) | Available | Available (Activity Log) | Partially Available | Available (Versioning) | Partially Available | Available (Audit Log) |
| **Multi-Company Management** | Available | Available | Tier-Dependent | Partially Available | Available | Tier-Dependent | Available |
| **Multi-Branch Centralized Sync** | Partially Available (Sync/RDP) | Partially Available (Cloud/BNS) | Available (Cloud SaaS) | Not Available | Available (Cloud SaaS) | Partially Available (Cloud) | Partially Available (eBusiness) |
| **Batch Number Tracking** | Available | Available | Tier-Dependent (Inventory) | Available | Available | Available | Available |
| **Expiry Date Management** | Available | Available | Tier-Dependent (Inventory) | Available | Available | Available | Available |
| **Automatic FEFO Allocation** | Partially Available (Manual pick) | Partially Available (Warns) | Partially Available (Zoho Inv) | Not Available (Manual) | Available (Automatic) | Partially Available (Manual) | Available (Auto/Prompt) |
| **Multi-Warehouse / Godowns** | Available | Available | Available | Available | Available | Available | Available |
| **Inventory Valuation (FIFO)** | Available | Available | Available | Available | Available | Available | Available |
| **Stock Valuation (Weighted Avg)** | Available | Available | Not Available (FIFO only) | Partially Available | Available | Partially Available | Available |
| **GST E-Invoicing & E-Way Bill** | Available (Connected GST) | Available (Built-in) | Available (Direct API) | Tier-Dependent | Available (India Compliance) | Available (Direct) | Available (Direct) |
| **GSTR-1 & GSTR-2B Auto-Reconciliation** | Available | Available (Dashboard) | Available | Partially Available (Export) | Available | Partially Available | Available |
| **Barcode Generation & Scanning** | Available | Available | Available | Available | Available | Available | Available |
| **Thermal Receipt Printing (2"/3")** | Available | Available | Partially Available | Available | Available | Available | Available |
| **Dynamic UPI QR on Receipts** | Available | Available | Available | Available | Available (India Comp) | Available | Available |
| **WhatsApp Invoice Sharing** | Available (Meta BSP) | Available | Available | Available | Available (Integration) | Available | Available |
| **RESTful Developer API** | Not Available (XML/ODBC) | Not Available (Proprietary) | Available (OAuth 2.0 REST) | Not Available | Available (REST API) | Partially Available | Not Available (Desktop/DBF) |
| **Offline Counter Resilience** | Available (Desktop) | Available (Desktop) | Not Available (Cloud only) | Available (Local SQLite) | Partially Available (PWA) | Available (Hybrid) | Available (Desktop) |
| **Pre-Loaded National Drug Master**| Not Available | Not Available | Not Available | Not Available | Not Available | Not Available | Available (400k+ SKUs) |
| **Generic Salt / Substitute Search**| Not Available | Partially Available (Alias) | Not Available | Not Available | Not Available | Not Available | Available (Deep composition) |
| **Schedule H/H1/Narcotic Registers**| Not Available (Needs TDL) | Partially Available (Custom) | Not Available | Not Available | Partially Available (Script) | Not Available | Available (Statutory Form 35) |
| **Pharma PTR / PTS / MRP Pricing**| Partially Available | Available | Partially Available | Partially Available | Partially Available | Partially Available | Available (Native engine) |
| **Trade Schemes (e.g., 10+1 Free)** | Partially Available | Available | Weak / Workaround | Partially Available | Partially Available | Partially Available | Available (Full Deal Schemes) |
| **Physical Rack / Bin Locator on POS**| Not Available | Partially Available | Not Available | Not Available | Partially Available | Not Available | Available (Native field) |
| **Loose Unit Dispensing (Strips/Tabs)**| Available (Alternate Units)| Available (Dual Unit) | Weak / Workaround | Weak / Workaround | Available (UOM Conv) | Partially Available | Available (Native strip/tab) |

---

# Pharmacy Feature Matrix

The following matrix zeroes in on the clinical, supply chain, and statutory requirements specific to pharmacy operations:

| Specific Pharmacy Capability | TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Pre-loaded Medicine Database** | Not Available | Not Available | Not Available | Not Available | Not Available | Not Available | **Available** (400,000+ items) |
| **Generic Salt Composition Index**| Not Available | Partially Available | Not Available | Not Available | Not Available | Not Available | **Available** (Comprehensive) |
| **Substitute Drug Suggestion** | Not Available | Not Available | Not Available | Not Available | Not Available | Not Available | **Available** (Instant hotkey) |
| **Schedule H / H1 Regulatory Flag**| Not Available | Partially Available | Not Available | Not Available | Partially Available | Not Available | **Available** (Native prompt) |
| **Schedule X / Narcotic Register** | Not Available | Not Available | Not Available | Not Available | Not Available | Not Available | **Available** (Statutory Form) |
| **Mandatory Doctor/Patient Capture**| Not Available | Available | Not Available | Not Available | Available (Healthcare) | Not Available | **Available** (Mandatory pop-up)|
| **FEFO Automated Batch Allocation**| Partially Available | Partially Available | Partially Available | Not Available | **Available** (Automated) | Partially Available | **Available** (Enforced) |
| **Near-Expiry Warning at Billing** | Partially Available | Available | Partially Available | Available | Available | Available | **Available** (Color-coded) |
| **Hard Block on Expired Drugs** | Partially Available | Available | Partially Available | Partially Available | Available | Partially Available | **Available** (Strict lock) |
| **Loose Tablet Dispensing (Strip/Tab)**| Available (Alt Unit)| Available (Dual Unit)| Weak (Decimal) | Weak (Decimal) | Available (UOM) | Partially Available | **Available** (Native .fraction)|
| **Physical Rack / Shelf Location**| Not Available | Partially Available | Not Available | Not Available | Partially Available | Not Available | **Available** (Displayed on POS)|
| **Pharma Margin Rules (PTR/PTS)**| Not Available | Partially Available | Not Available | Not Available | Not Available | Not Available | **Available** (Standard 20/10%) |
| **Trade Deal Schemes (10+1 / Half)**| Partially Available | Available | Not Available | Partially Available | Partially Available | Partially Available | **Available** (Advanced scheme) |
| **Distributor Expiry/Breakage Note**| Not Available | Partially Available | Not Available | Not Available | Not Available | Not Available | **Available** (Dedicated return) |
| **Doctor Prescription Image Capture**| Not Available | Available (Attachment)| Available (Attachment)| Not Available | Available (DocType) | Not Available | **Available** (Prescription doc)|
| **Refill Reminders for Chronic Patients**| Not Available | Not Available | Not Available | Not Available | Partially Available | Not Available | **Available** (SMS/WhatsApp) |
| **Sub-15-Second Counter Turnaround**| Not Available (Dialogs) | Partially Available | Not Available (Cloud UI)| Partially Available | Not Available (Desk UI)| Partially Available | **Available** (Keyboard-first) |

---

# Accounting Feature Matrix

| Accounting Functionality | TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Accounting Paradigm** | Strict Double-Entry | Strict Double-Entry | Strict Double-Entry | Single-Entry / Hybrid | Strict Double-Entry | Single-Entry / Hybrid | Strict Double-Entry |
| **Hierarchical Ledgers / COA** | Available (Unlimited) | Available (Unlimited) | Available (Unlimited) | Not Available | Available (Unlimited) | Not Available | Available (Hierarchical) |
| **Journal Voucher Posting** | Available | Available | Available | Not Available | Available | Not Available | Available |
| **Bill-by-Bill Allocation** | Available | Available | Available | Available | Available | Available | Available |
| **Cost Centers / Categories** | Available | Available | Available (Tags) | Not Available | Available | Not Available | Available |
| **Bank Reconciliation (BRS)** | Available (API & File)| Available (File) | Available (Live Feeds)| Partially Available | Available (File/API) | Partially Available | Available (MargPay API) |
| **Direct Bank Payouts** | Available (Axis/SBI) | Not Available | Available (ICICI/Axis) | Not Available | Not Available | Not Available | Available (MargPay) |
| **Financial Periods & Book Closing**| Available | Available | Available | Partially Available | Available | Partially Available | Available |
| **Balance Sheet & P&L** | Available (Real-time) | Available (Real-time) | Available (Real-time) | Simplified Summary | Available (Real-time) | Simplified Summary | Available (Real-time) |
| **Schedule III Financials** | Available | Available | Not Available | Not Available | Not Available | Not Available | Available |
| **Audit Trail (MCA Mandate)** | Available (Edit Log) | Available | Available (Activity Log) | Partially Available | Available (Versioning) | Partially Available | Available (Audit Log) |
| **Multi-Currency Accounting** | Available | Available | Available | Not Available | Available | Not Available | Available |

---

# Inventory Feature Matrix

| Inventory Capability | TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SKU & Multi-Barcode Master** | Available | Available | Available | Available | Available | Available | Available |
| **Batch Number Tracking** | Available | Available | Tier-Dependent | Available | Available | Available | Available |
| **Expiry & Manufacturing Dates** | Available | Available | Tier-Dependent | Available | Available | Available | Available |
| **Multi-Godown / Locations** | Available | Available | Available | Available | Available | Available | Available |
| **Inter-Godown Stock Transfers** | Available | Available | Available | Available | Available | Available | Available |
| **Inventory Valuation (FIFO)** | Available | Available | Available | Available | Available | Available | Available |
| **Inventory Valuation (Weighted Avg)**| Available | Available | Not Available | Partially Available | Available | Partially Available | Available |
| **Reorder Level & Minimum Stock** | Available | Available | Available | Available | Available | Available | Available |
| **Physical Stock Reconciliation**| Available | Available | Available | Available | Available | Available | Available |
| **Dead / Slow-Moving Stock Analysis**| Available | Available | Available | Available | Available | Available | Available |
| **Packaging Unit Conversions** | Available | Available | Partially Available | Partially Available | Available | Available | Available |
| **Landed Cost Allocation** | Available | Available | Available | Not Available | Available | Not Available | Available |

---

# POS Feature Matrix

| Point of Sale Capability | TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Dedicated Retail POS Interface** | Partially Available | Available | Not Available (Standard) | Available | Available (Frappe POS) | Available | **Available** (Optimized) |
| **Keyboard-Only Operation (No Mouse)**| Available (Generic) | Available | Not Available (Mouse UI) | Partially Available | Not Available | Partially Available | **Available** (Pharma-specific) |
| **Instant Barcode Scanning** | Available | Available | Available | Available | Available | Available | Available |
| **Hold / Resume Multiple Bills** | Not Available (Workaround) | Available | Not Available | Not Available | Available | Partially Available | **Available** (Dedicated key) |
| **Split Tender (Cash/Card/UPI)** | Available | Available | Available | Available | Available | Available | Available |
| **Dynamic UPI QR on Thermal Bill** | Available | Available | Available | Available | Available | Available | Available |
| **WhatsApp Invoice Sharing** | Available | Available | Available | Available | Available | Available | Available |
| **ESC/POS Thermal Receipt Printing**| Available | Available | Partially Available | Available | Available | Available | Available |
| **Cash Drawer Kick-Out Trigger** | Available | Available | Not Available | Available | Available | Available | Available |
| **Sub-15-Second Counter Checkout**| Not Available | Partially Available | Not Available | Partially Available | Not Available | Partially Available | **Available** |

---

# Reporting Feature Matrix

| Reporting & Analytics Dimension | TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Drill-Down Financial MIS** | Available (Exceptional)| Available | Available | Simplified | Available | Simplified | Available |
| **Batch Expiry & Near-Expiry Reports**| Available | Available | Tier-Dependent | Available | Available | Available | **Available** (Comprehensive) |
| **Statutory Schedule H1 / Narcotic**| Not Available (Needs TDL)| Partially Available | Not Available | Not Available | Partially Available | Not Available | **Available** (Native Form 35) |
| **GSTR-1, 2B, 3B Reconciliation**| Available | Available (Dashboard) | Available | Partially Available | Available | Partially Available | Available |
| **Stock Aging & Dump Stock Reports** | Available | Available | Available | Available | Available | Available | Available |
| **Item-wise / Batch-wise Margins** | Available | Available | Available | Partially Available | Available | Available | Available |
| **Doctor / MR Sales Analytics** | Not Available | Available | Not Available | Not Available | Available (Healthcare) | Not Available | **Available** (Specialized) |
| **Export to Excel / PDF / CSV** | Available | Available | Available | Available | Available | Available | Available |
| **Scheduled Automated Email Reports**| Not Available | Partially Available | Available | Not Available | Available | Not Available | Partially Available |
| **Custom Report Builder** | Available (TDL) | Available (Query) | Available (Custom views)| Not Available | Available (Query Report)| Not Available | Available (Configurable) |

---

# Automation Matrix

| Automation Feature | TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Automated Reorder Material Requests**| Partially Available | Available | Available | Available | **Available** (Auto PO) | Available | **Available** (Supplier-wise)|
| **Automated FEFO Batch Selection** | Not Available (Manual) | Partially Available | Partially Available | Not Available | **Available** (Auto pick) | Partially Available | **Available** (Enforced) |
| **Automated Recurring Invoices** | Not Available | Partially Available | **Available** (Scheduled)| Not Available | **Available** (Auto submit)| Not Available | Partially Available |
| **Automated Payment Reminders** | Partially Available | Available | **Available** (Escalating)| Available (SMS/WA) | **Available** (Dunning) | Available (SMS/WA) | Available |
| **Direct E-Invoice IRN Generation** | Available (Connected) | Available (Direct) | Available (Direct) | Tier-Dependent | Available (India Comp) | Available | Available (Direct) |
| **Automated Bank Statement Categorization**| Partially Available | Not Available | **Available** (Rule-based)| Not Available | Partially Available | Not Available | Partially Available |
| **Automated Chronic Patient Refill SMS**| Not Available | Not Available | Not Available | Not Available | Partially Available | Not Available | **Available** (Dedicated) |
| **Scheduled Database Cloud Backup** | Available (TallyDrive) | Available (Online BNS)| Native Cloud (Continuous)| Partially Available | Native / S3 Backup | Native Cloud | Partially Available (MargDrive)|

---

# Integration Matrix

| Integration / Ecosystem Dimension| TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Public REST API Availability** | Not Available (XML/ODBC)| Not Available (Proprietary)| **Available** (OAuth 2.0 REST)| Not Available | **Available** (Full REST API)| Partially Available | Not Available (Desktop DBF) |
| **Real-time Webhooks** | Not Available | Not Available | **Available** | Not Available | **Available** | Not Available | Not Available |
| **Connected Banking Gateway** | Available (Axis, SBI, Kotak)| Not Available | **Available** (ICICI, Axis, Yes)| Not Available | Partially Available | Not Available | **Available** (MargPay) |
| **Direct GSTN Portal Integration** | Available | Available | Available | Tier-Dependent | Available | Available | Available |
| **ESC/POS Thermal Receipt Printers** | Available | Available | Partially Available | Available | Available | Available | Available |
| **Payment Gateway Links (UPI/Cards)** | Available | Available | Available | Available | Available | Available | Available |
| **WhatsApp Business API Messaging** | Available (Official BSP)| Available | Available | Available | Available (Via Apps) | Available | Available |
| **E-Commerce & Marketplace Connectors**| Third-party TDL | Third-party | Available (Zoho Commerce) | Available (Storefront)| Available (Shopify/Woo)| Available (Storefront) | Available (Pharma B2B) |

---

# Technical Capability Matrix

| Technical Architectural Factor | TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Underlying Database** | Proprietary Flat-File | MS Access / MS SQL | Cloud PostgreSQL | SQLite (Local) | MariaDB / PostgreSQL | Cloud DynamoDB/Postgres | xBase / FoxPro / DBF |
| **Server / Application Framework** | Proprietary C++ Runtime | Win32 C++ Desktop | Java Cloud Platform | Desktop Electron / Native | Python WSGI (Frappe) | Node / Electron / Cloud | C++ / FoxPro Runtime |
| **Multi-Tenant Cloud Support** | Not Available | Partially Available | **Available** (Native Cloud) | Not Available | **Available** (Frappe Cloud)| **Available** (Native Cloud)| Partially Available (Marg Books)|
| **Offline Counter Resilience** | **Exceptional** (Local) | **Exceptional** (Local) | Not Available (Internet req)| **Exceptional** (Local) | Partially Available (PWA) | **High** (Local sync) | **Exceptional** (Local) |
| **Custom Code Scripting Engine** | TDL (Proprietary) | Custom Query / Add-on | Deluge Scripting | Not Available | Python & JavaScript | Not Available | FoxPro / Custom scripts |
| **Data Synchronization Architecture**| Tally.NET / Sync Server| BUSY Agent / BNS | Real-time Cloud | Cloud Drive File Sync | Real-time REST / DB | Real-time WebSocket/Cloud | Marg Server / FTP Sync |
| **Vulnerability to Data Corruption** | Low (Proprietary file) | Medium (Jet MDB) / Low (SQL)| Ultra-Low (Managed Cloud) | Low (Local SQLite) | Ultra-Low (ACID MariaDB) | Low (Managed Cloud) | High (DBF/CDX index corruption)|

---

# Feature Maturity Matrix (Levels 1 to 5)

Every major system capability is evaluated across five maturity tiers:
* **Level 1 (Basic):** Rudimentary data capture; manual operation; static values.
* **Level 2 (Functional):** Operational workflow support; standard business calculations.
* **Level 3 (Advanced):** High degree of automation, deep customization, complex business rules.
* **Level 4 (Enterprise):** Multi-branch, strict security/audit controls, scalable concurrency, open APIs.
* **Level 5 (Intelligent):** Machine learning, predictive forecasting, automated anomaly detection, natural language querying.

| System Capability | TallyPrime | BUSY 21 | Zoho Books | Vyapar | ERPNext | myBillBook | MARG ERP 9+ | Target System (Our Platform) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **General Ledger & Accounting** | Level 4 | Level 4 | Level 4 | Level 2 | Level 4 | Level 2 | Level 4 | **Level 4** (Enterprise Ledger) |
| **Batch & Expiry Management** | Level 3 | Level 3 | Level 2 | Level 2 | Level 3 | Level 2 | Level 4 | **Level 5** (AI Expiry Risk & FEFO) |
| **Pharmacy Regulatory Compliance**| Level 1 | Level 2 | Level 1 | Level 1 | Level 2 | Level 1 | Level 4 | **Level 5** (AI Drug Schedule & Form 35)|
| **POS Billing Speed & Ergonomics**| Level 3 | Level 3 | Level 2 | Level 3 | Level 2 | Level 3 | Level 4 | **Level 5** (Keyboard-first + Vision POS)|
| **Pharma Margin & Deal Schemes** | Level 2 | Level 3 | Level 1 | Level 2 | Level 2 | Level 2 | Level 4 | **Level 4** (Automated PTR/PTS & Deals)|
| **Generic Salt & Substitute Search**| Level 1 | Level 2 | Level 1 | Level 1 | Level 1 | Level 1 | Level 4 | **Level 5** (AI Composition Matching) |
| **E-Invoicing & GST Compliance** | Level 4 | Level 4 | Level 4 | Level 3 | Level 4 | Level 3 | Level 4 | **Level 4** (Zero-click GSTN Filing) |
| **API & Technical Architecture** | Level 2 | Level 2 | Level 4 | Level 1 | Level 4 | Level 2 | Level 1 | **Level 5** (GraphQL/REST, Webhooks, PWA)|
| **Predictive Inventory Intelligence**| Level 2 | Level 2 | Level 2 | Level 1 | Level 3 | Level 1 | Level 2 | **Level 5** (AI Demand & Dump Prediction)|
"""

print("Matrices built successfully.")
