# Test Plan
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Objectives

- Verify all functional requirements are implemented correctly.
- Validate non-functional requirements (performance, security, usability).
- Ensure regulated workflows (controlled substances, audit trails) are error-free.
- Detect and document defects before production deployment.

---

## 2. Scope

### In Scope
- All functional modules: Stock, Dispensing, Procurement, Alerts, Reports, User Management
- Authentication and RBAC
- Barcode scanning integration
- Expiry and batch tracking
- Audit trail integrity
- Performance under expected load
- Security testing (OWASP Top 10)

### Out of Scope
- Third-party EHR system internals
- Hardware device testing (handled by vendor)

---

## 3. Test Types

| Test Type | Tool / Method | Responsibility |
|---|---|---|
| Unit Testing | Jest (Node.js) | Developers |
| Integration Testing | Supertest + Jest | Developers |
| End-to-End Testing | Playwright | QA Team |
| Performance Testing | k6 | DevOps / QA |
| Security Testing | OWASP ZAP, manual | Security Team |
| UAT | Manual, test scripts | Pharmacists, Nurses, Admin |
| Regression Testing | Automated suite (CI) | QA Team |

---

## 4. Test Environment

| Environment | Purpose |
|---|---|
| Development | Developer unit/integration tests |
| Staging | QA, UAT, regression tests |
| Pre-production | Performance and security tests |
| Production | Smoke tests post-deployment only |

---

## 5. Entry & Exit Criteria

### Entry Criteria
- Feature development complete and code reviewed.
- Build deployed to staging.
- Test data prepared.

### Exit Criteria
- All P1/P2 defects resolved.
- > 95% test case pass rate.
- UAT sign-off from Pharmacy Manager.
- Performance benchmarks met (< 500ms API response at 200 concurrent users).

---

## 6. Test Schedule

| Phase | Duration | Owner |
|---|---|---|
| Unit & Integration Testing | Continuous (per sprint) | Dev Team |
| System Testing | Week 1–2 before release | QA Team |
| UAT | Week 3 before release | Business Users |
| Performance & Security | Week 4 before release | DevOps / Security |
| Regression (pre-release) | 2 days before release | QA Automation |

---

## 7. Defect Management

- Defects tracked in Jira / GitHub Issues.
- Severity: Critical, High, Medium, Low.
- Critical defects block release; others assessed per risk.

---

*Owner: [QA Lead]*
*Next Review: Per release cycle*
