# System Architecture Document — High-Level Design (HLD)
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. System Overview

The Pharmacy Management System (PMS) is a web-based, multi-role application designed to manage pharmaceutical inventory, procurement, dispensing, expiry tracking, and compliance reporting for hospitals and standalone pharmacies.

---

## 2. Architecture Style

- **Pattern:** Layered Monolith with service-oriented modules (ready for microservice extraction)
- **Deployment:** Cloud-hosted (AWS / Azure) with on-premise option
- **Client:** Responsive web application (React.js frontend)
- **Backend:** Node.js / Express REST API
- **Database:** PostgreSQL (relational) + Redis (caching/sessions)

---

## 3. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────┐
│                  CLIENT LAYER               │
│  Browser (React SPA) │ Barcode Scanner App  │
└───────────────┬─────────────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────────────┐
│             API GATEWAY / NGINX             │
│  Rate Limiting │ SSL Termination │ Routing  │
└───────────────┬─────────────────────────────┘
                │
┌───────────────▼─────────────────────────────┐
│           APPLICATION LAYER (Node.js)        │
│  Auth │ Stock │ Dispensing │ Procurement     │
│  Expiry │ Reports │ Alerts │ Notifications  │
└───────┬───────────────────────┬─────────────┘
        │                       │
┌───────▼──────┐   ┌────────────▼────────────┐
│  PostgreSQL  │   │    Redis Cache/Queue     │
│  (Primary DB)│   │  (Sessions, Alerts)      │
└──────────────┘   └─────────────────────────┘
        │
┌───────▼──────────────────────────────────────┐
│            EXTERNAL INTEGRATIONS             │
│  EHR/EMR │ Supplier APIs │ SMS/Email Gateway│
│  Barcode/RFID │ Cold Chain Sensors │ Billing│
└──────────────────────────────────────────────┘
```

---

## 4. Key Components

| Component | Technology | Responsibility |
|---|---|---|
| Frontend | React.js + Tailwind CSS | UI for all roles |
| API Layer | Node.js + Express | Business logic, REST APIs |
| Auth Service | JWT + bcrypt | Authentication & RBAC |
| Database | PostgreSQL | Persistent data storage |
| Cache | Redis | Sessions, real-time alerts |
| File Storage | AWS S3 / Azure Blob | Invoices, prescriptions, reports |
| Notification | Twilio / SendGrid | SMS/Email alerts |
| Barcode Engine | ZXing / custom adapter | Drug scanning |
| Scheduler | Node-cron | Expiry alerts, report generation |

---

## 5. Deployment Architecture

- **Environments:** Development → Staging → Production
- **CI/CD:** GitHub Actions
- **Containerization:** Docker + Docker Compose
- **Cloud:** AWS EC2 / RDS / S3 / CloudWatch

---

## 6. Security Architecture Summary

- All communications over HTTPS/TLS 1.3
- JWT-based stateless authentication
- Role-Based Access Control (RBAC) enforced at API level
- Data encrypted at rest (AES-256) and in transit
- Audit logs stored in immutable append-only table

---

*Author: [System Architect Name]*
*Next Review: March 2027*
