module.exports = {
  collectCoverage: true,
  // Ratchet, not a target: raise these when coverage rises, never lower
  // them to make a red run green.
  coverageThreshold: {
    global: { statements: 97, branches: 83, functions: 100, lines: 98 },
  },
  coverageDirectory: './coverage/',
  coveragePathIgnorePatterns: ['/dist/'],
  moduleFileExtensions: ['js', 'json'],
  modulePathIgnorePatterns: ['/example/'],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/example/', '/test/e2e/'],
  transform: {
    '^.+\\.(js)$': 'esbuild-jest',
    '^.+\\.(mjs)$': 'esbuild-jest'
  },
  transformIgnorePatterns: ["/node_modules/(?!(druxt)/)"]
}

