# Security Architecture Document
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Security Objectives

- **Confidentiality:** Protect patient, drug, and financial data from unauthorized access.
- **Integrity:** Ensure data is not tampered with during storage or transmission.
- **Availability:** Ensure the system is accessible to authorized users when needed.
- **Accountability:** All user actions are logged and non-repudiable.

---

## 2. Authentication

| Mechanism | Details |
|---|---|
| Method | Username + Password |
| Password Hashing | bcrypt (cost factor 12) |
| Session Management | JWT (access token: 15 min, refresh token: 7 days) |
| Multi-Factor Auth | TOTP (Google Authenticator) — mandatory for admin roles |
| Account Lockout | 5 failed attempts → 15-minute lockout |
| Password Policy | Min 10 chars, uppercase, number, special char, no reuse of last 5 |

---

## 3. Authorization — RBAC

Roles: `admin`, `pharmacist`, `nurse`, `procurement`, `auditor`

Permissions enforced at:
- API route level (middleware check)
- UI component level (conditional rendering)
- Database row level (owner-based filtering where applicable)

See separate **RBAC Matrix** document.

---

## 4. Transport Security

- All communications over **HTTPS / TLS 1.3**.
- HSTS (HTTP Strict Transport Security) enforced.
- Certificates managed via Let's Encrypt (auto-renewal) or enterprise CA.
- API Gateway validates TLS before routing to backend.

---

## 5. Data Encryption at Rest

- Database: **AES-256** encryption (PostgreSQL Transparent Data Encryption or cloud provider managed keys).
- File Storage (S3/Blob): Server-Side Encryption with customer-managed keys.
- Sensitive fields (e.g., patient identifiers): Application-level encryption using envelope encryption (AWS KMS / Azure Key Vault).

---

## 6. Input Validation & Protection

| Threat | Mitigation |
|---|---|
| SQL Injection | Parameterized queries (ORM / prepared statements) |
| XSS | Content Security Policy header; React auto-escaping |
| CSRF | SameSite=Strict cookies; CSRF tokens for state-changing requests |
| Rate Limiting | 100 req/min per IP at API Gateway |
| File Upload | Whitelist MIME types; virus scan via ClamAV |
| Dependency Vulnerabilities | npm audit in CI; Dependabot alerts |

---

## 7. Network Security

- Application deployed in private subnet; no direct public internet access.
- API Gateway / Load Balancer in public subnet (DMZ).
- Web Application Firewall (WAF) — OWASP Core Rule Set.
- Database accessible only from application subnet.
- VPN required for administrative access to servers.

---

## 8. Secrets Management

- All secrets (DB passwords, API keys, JWT secrets) stored in **AWS Secrets Manager / Azure Key Vault**.
- No secrets in source code or environment files committed to version control.
- Secrets rotated quarterly.

---

## 9. Security Logging

All security events logged:
- Authentication success/failure
- Authorization failures (403)
- Admin privilege actions
- Data export events
- Configuration changes

Logs shipped to centralized SIEM (e.g., AWS CloudWatch / Splunk).

---

*Owner: [Security Team / CTO]*
*Next Review: March 2027*
