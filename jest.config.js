const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const baseConfig = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
}

module.exports = async () => {
  const [unit, integration] = await Promise.all([
    createJestConfig({
      ...baseConfig,
      displayName: 'unit',
      testMatch: ['**/__tests__/**/*.test.(ts|tsx)', '**/*.test.(ts|tsx)'],
      testPathIgnorePatterns: ['.*\\.integration\\.test\\.ts$'],
    })(),
    createJestConfig({
      ...baseConfig,
      displayName: 'integration',
      testMatch: ['**/*.integration.test.ts'],
    })(),
  ])
  return { projects: [unit, integration] }
}