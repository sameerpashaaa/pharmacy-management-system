# Data Encryption Standards
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

This document defines the encryption standards applied to data at rest and in transit within the Pharmacy Management System.

---

## 2. Encryption at Rest

| Data Category | Encryption Method | Key Management |
|---|---|---|
| Database (PostgreSQL) | AES-256 (TDE) | Cloud provider managed (AWS RDS / Azure) |
| File storage (S3/Blob) | AES-256-GCM (SSE) | Customer Managed Keys (CMK) via AWS KMS |
| Sensitive PII fields | AES-256 application-level encryption | Envelope encryption — AWS KMS / Azure Key Vault |
| Audit log files | AES-256 | Separate KMS key with restricted access |
| Backup files | AES-256 | CMK — separate backup key |

### Application-Level Encryption
Fields encrypted at application level before DB insert:
- Patient identifiers (`patient_id`, `patient_name`)
- Prescription data
- User passwords (bcrypt, not AES — one-way)

---

## 3. Encryption in Transit

| Communication Path | Protocol | Minimum Version |
|---|---|---|
| Browser ↔ API Gateway | HTTPS / TLS | TLS 1.3 |
| API Gateway ↔ App Server | HTTPS / TLS | TLS 1.2 |
| App Server ↔ Database | SSL | TLS 1.2 |
| App Server ↔ Redis | TLS | TLS 1.2 |
| App Server ↔ External APIs | HTTPS / TLS | TLS 1.2 |
| MQTT (IoT sensors) | TLS | TLS 1.2 |

**Disabled:** SSLv3, TLS 1.0, TLS 1.1, RC4, DES, MD5 ciphers.

---

## 4. Key Management

- Keys stored in **AWS KMS / Azure Key Vault** — never in application code or config files.
- Key rotation: **Annually** (or immediately upon suspected compromise).
- Access to keys: restricted to application service accounts only.
- Key access logging: all KMS API calls are logged to CloudTrail / Azure Monitor.

---

## 5. Password Security

- User passwords hashed with **bcrypt** (cost factor 12).
- No plaintext passwords stored or logged anywhere.
- Forgot-password flow uses time-limited (15 min) signed tokens.

---

## 6. Compliance

| Standard | Requirement | Status |
|---|---|---|
| HIPAA | Encrypt ePHI at rest and in transit | ✅ Compliant |
| GDPR | Appropriate technical measures for personal data | ✅ Compliant |
| PCI DSS (if applicable) | TLS for card data transmission | ✅ Compliant |
| DPDP Act (India) | Data protection measures | ✅ Compliant |

---

*Owner: [Security Team / CTO]*
*Next Review: September 2027*
