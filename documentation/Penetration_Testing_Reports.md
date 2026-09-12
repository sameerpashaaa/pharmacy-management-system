# Penetration Testing Reports
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

> [!NOTE]
> This document serves as the template and record for penetration testing activities. Actual test results should be appended after each engagement.

---

## 1. Testing Schedule

| Test Type | Frequency | Scope |
|---|---|---|
| External Penetration Test | Annual | Public-facing APIs, web app |
| Internal Penetration Test | Annual | Internal network, DB access |
| Web Application Pentest (DAST) | Bi-annual | All API endpoints, UI |
| Vulnerability Scan | Monthly | All servers, dependencies |
| Social Engineering Test | Annual | Staff phishing simulation |

---

## 2. Scope of Testing

### In Scope
- Web application (React frontend)
- REST API (all endpoints)
- Authentication and session management
- Database access controls
- Network perimeter (DMZ, API gateway)
- Third-party integration endpoints

### Out of Scope
- Physical security
- Third-party SaaS tools not under our control

---

## 3. Methodology

Tests follow:
- **OWASP Testing Guide v4.2**
- **PTES (Penetration Testing Execution Standard)**
- **OWASP Top 10** coverage (mandatory)

---

## 4. Report Template

### 4.1 Executive Summary
- Date of test
- Testing vendor / team
- Overall risk rating
- Number of findings by severity

### 4.2 Findings Table

| ID | Title | Severity | CVSS Score | Status |
|---|---|---|---|---|
| PT-001 | Example: SQL Injection in /api/drugs | Critical | 9.8 | Remediated |
| PT-002 | Example: Missing rate limiting | Medium | 5.3 | In Progress |

### 4.3 Detailed Finding

**Finding ID:** PT-001
**Severity:** Critical
**Description:** [Description of vulnerability]
**Evidence:** [Screenshots, request/response]
**Impact:** [Business impact]
**Remediation:** [Steps taken or recommended]
**Retested:** [Date and result]

---

## 5. Previous Engagements

| Date | Vendor | Findings (C/H/M/L) | Status |
|---|---|---|---|
| [Date] | [Vendor Name] | [0/0/0/0] | Pending |

*Reports from completed engagements are stored in: `/documentation/pentest-reports/` (access restricted to Security Team)*

---

*Owner: [Security Team / CISO]*
*Next Review: After each engagement*
