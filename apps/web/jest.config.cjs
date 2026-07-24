const nextJest = require("next/jest.js").default;

const createJestConfig = nextJest({ dir: __dirname });

module.exports = createJestConfig({
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@high-ground/quipsly-domain/coaching-packet$":
      "<rootDir>/../../packages/quipsly-domain/src/coaching-packet.ts",
  },
  modulePathIgnorePatterns: ["<rootDir>/.next/standalone"],
});
