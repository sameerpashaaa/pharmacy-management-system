# Version Control & Change Management Log
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Version Control Strategy

The PMS uses **Git** (hosted on GitHub) with the following conventions:

### Branch Strategy (GitFlow)
| Branch | Purpose |
|---|---|
| `main` | Production-ready code only |
| `develop` | Integration branch for completed features |
| `feature/[name]` | Individual feature development |
| `hotfix/[name]` | Emergency production fixes |
| `release/[version]` | Release preparation |

### Commit Message Convention
```
<type>(<scope>): <short description>

Types: feat, fix, docs, refactor, test, chore, security
Example: feat(dispensing): add barcode scan verification
Example: fix(stock): correct FEFO batch selection logic
Example: security(auth): enforce MFA for admin roles
```

### Tagging
- Releases tagged as `v[MAJOR].[MINOR].[PATCH]` (Semantic Versioning).
- Hotfixes increment PATCH: `v1.0.1`.
- New features increment MINOR: `v1.1.0`.
- Breaking changes increment MAJOR: `v2.0.0`.

---

## 2. Change Management Process

### Change Types
| Type | Approval Required | Testing Required |
|---|---|---|
| Emergency Hotfix | Tech Lead + Pharmacy Manager | Smoke test on staging |
| Standard Bug Fix | Tech Lead | Full regression |
| New Feature | Project Manager + Pharmacy Manager | Full test suite + UAT |
| Infrastructure Change | DevOps Lead + CTO | Staging validation |
| DB Schema Change | Tech Lead + DBA | Staging migration + rollback test |

### Standard Change Process
```
1. Change Request raised (Jira ticket)
2. Impact assessment by Tech Lead
3. Approval from required stakeholders
4. Development + code review (PR)
5. Testing on staging
6. UAT (if user-facing)
7. Deployment in maintenance window
8. Post-deployment monitoring
9. Change closure
```

---

## 3. Change Log

| Version | Date | Type | Description | Author | Approved By |
|---|---|---|---|---|---|
| v1.0.0 | Sep 2026 | Initial Release | Full initial system release | Dev Team | [Manager] |
| v1.0.1 | — | — | — | — | — |

---

## 4. Document Version History (This Document)

| Version | Date | Changes | Author |
|---|---|---|---|
| 1.0 | Sep 2026 | Initial creation | [Name] |

---

*Owner: [Tech Lead / Project Manager]*
*Next Review: Per release*
