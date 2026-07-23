import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Browser journeys use Playwright's runner. Keeping Jest on explicit
  // *.test files prevents it from importing Playwright specs into jsdom.
  testMatch: ['**/?(*.)+(test).[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // pnpm keeps each app's runtime peer graph isolated. Jest and Testing
    // Library must share one React dispatcher from the workspace root or a
    // filtered install can resolve the component and renderer to different
    // physical React copies.
    '^react$': '<rootDir>/../../node_modules/react',
    '^react/(.*)$': '<rootDir>/../../node_modules/react/$1',
    '^react-dom$': '<rootDir>/../../node_modules/react-dom',
    '^react-dom/(.*)$': '<rootDir>/../../node_modules/react-dom/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@high-ground/quipsly-domain/art-recipes$': '<rootDir>/../../packages/quipsly-domain/src/art-recipes.ts',
    '^@high-ground/quipsly-domain/generated-art$': '<rootDir>/../../packages/quipsly-domain/src/generated-art.ts',
    '^@high-ground/quipsly-domain/output-catalog$': '<rootDir>/../../packages/quipsly-domain/src/output-catalog.ts',
    '^@high-ground/quipsly-domain/coaching-packet$': '<rootDir>/../../packages/quipsly-domain/src/coaching-packet.ts',
    '^@high-ground/quipsly-domain/transcript-derived-task$': '<rootDir>/../../packages/quipsly-domain/src/transcript-derived-task.ts',
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/standalone'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
