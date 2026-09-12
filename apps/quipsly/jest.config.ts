import type { Config } from 'jest';
import nextJest from 'next/jest.js';
import domainPackage from '../../packages/quipsly-domain/package.json' with { type: 'json' };

// Exercise the actual public domain modules in API tests. A hand-maintained
// subset silently made some routes untestable as package exports grew.
const domainSourceMappings = Object.fromEntries(
  Object.entries(domainPackage.exports).map(([subpath, target]) => [
    `^@high-ground/quipsly-domain${subpath === '.' ? '' : subpath.slice(1)}$`,
    `<rootDir>/../../packages/quipsly-domain/${target.import.slice(2)}`,
  ]),
);

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config: Config = {
  // Recycle workers between files instead of retaining hundreds of React/Next
  // module graphs in one process during the complete application suite.
  workerIdleMemoryLimit: '512MB',
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Browser journeys use Playwright's runner. Keeping Jest on explicit
  // *.test files prevents it from importing Playwright specs into jsdom.
  testMatch: ['**/?(*.)+(test).[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // NodeNext source uses runtime .js specifiers while Jest executes the
    // corresponding TypeScript sources directly.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // pnpm keeps each app's runtime peer graph isolated. Jest and Testing
    // Library must share one React dispatcher from the workspace root or a
    // filtered install can resolve the component and renderer to different
    // physical React copies.
    '^react$': '<rootDir>/../../node_modules/react',
    '^react/(.*)$': '<rootDir>/../../node_modules/react/$1',
    '^react-dom$': '<rootDir>/../../node_modules/react-dom',
    '^react-dom/(.*)$': '<rootDir>/../../node_modules/react-dom/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    ...domainSourceMappings,
    '^@high-ground/quipsly-document-kernel$': '<rootDir>/../../packages/quipsly-document-kernel/src/index.ts',
    '^@high-ground/quipsly-media-processing$': '<rootDir>/../../packages/quipsly-media-processing/src/index.ts',
    '^@high-ground/quipsly-media-processing/local-media-job-storage$': '<rootDir>/../../packages/quipsly-media-processing/src/local-media-job-storage.ts',
    '^@high-ground/quipsly-media-processing/external-source-proxy-identity$': '<rootDir>/../../packages/quipsly-media-processing/src/external-source-proxy-identity.ts',
    '^@high-ground/quipsly-media-processing/source-navigation-identity$': '<rootDir>/../../packages/quipsly-media-processing/src/source-navigation-identity.ts',
    '^@high-ground/quipsly-media-processing/google-drive-provider-credential$': '<rootDir>/../../packages/quipsly-media-processing/src/google-drive-provider-credential.ts',
    '^@high-ground/quipsly-media-processing/local-executor-identity$': '<rootDir>/../../packages/quipsly-media-processing/src/local-executor-identity.ts',
    '^@high-ground/quipsly-capture-verification$': '<rootDir>/../../packages/quipsly-capture-verification/src/index.ts',
  },
  modulePathIgnorePatterns: [
    // Development, release, recovery, and one-off validation bundles all carry
    // a copied package.json. Never let generated standalone trees enter Jest's
    // module graph or masquerade as a second Quipsly package.
    '<rootDir>/\\.next(?:-[^/]+)?/standalone',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
