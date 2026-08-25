module.exports = {
  collectCoverage: true,
  coverageDirectory: './coverage/',
  coveragePathIgnorePatterns: ['/dist/'],
  moduleFileExtensions: ['js', 'json'],
  modulePathIgnorePatterns: ['/example/'],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/example/'],
  transform: {
    '^.+\\.(js)$': 'esbuild-jest',
    '^.+\\.(mjs)$': 'esbuild-jest'
  },
  transformIgnorePatterns: ["/node_modules/(?!(druxt)/)"]
}

