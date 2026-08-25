module.exports = {
  collectCoverage: true,
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

