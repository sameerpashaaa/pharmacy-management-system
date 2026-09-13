import '@testing-library/jest-dom'

// Real-Postgres integration tests (see
// src/lib/sales/sales-service.integration.test.ts). Point at an
// isolated local test schema (pharma_test); override with
// TEST_DATABASE_URL when running against a managed test database.
process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ??
  'postgresql://pharmacy:pharmacy@localhost:5435/pharmacare?schema=pharma_test'
