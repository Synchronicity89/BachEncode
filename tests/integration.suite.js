/**
 * BachEncode Integration Test Suite
 * Comprehensive non-mock integration tests for all system components
 */

// Import all integration test suites
require('./EncodeDecode.integration.test.js');
require('./MotifCompressor.integration.test.js');
require('./MotifDetector.integration.test.js');
require('./KeyAnalyzer.integration.test.js');
require('./System.integration.test.js');
require('./Performance.stress.test.js');

// Test suite metadata
const INTEGRATION_TEST_SUITE = {
  name: 'BachEncode Integration Tests',
  version: '1.0.0',
  description: 'Complete end-to-end integration tests without mocks',
  testFiles: [
    'EncodeDecode.integration.test.js',
    'MotifCompressor.integration.test.js', 
    'MotifDetector.integration.test.js',
    'KeyAnalyzer.integration.test.js',
    'System.integration.test.js',
    'Performance.stress.test.js'
  ],
  coverage: {
    modules: ['EncodeDecode.js', 'MotifCompressor.js', 'MotifDetector.js', 'KeyAnalyzer.js'],
    testTypes: ['Integration', 'End-to-End', 'System', 'Performance', 'Stress'],
    realDataUsage: true,
    mockUsage: false
  },
  requirements: {
    testFiles: [
      'midi/BWV785.MID'
    ],
    nodeVersion: '>=14.0.0',
    memory: '>=512MB available',
    timeout: '60 seconds per test suite'
  }
};

// Export test suite metadata for tooling
if (typeof module !== 'undefined' && module.exports) {
  module.exports = INTEGRATION_TEST_SUITE;
}

console.log(`
==============================================
BachEncode Integration Test Suite Loaded
==============================================
Test Files: ${INTEGRATION_TEST_SUITE.testFiles.length}
Modules Covered: ${INTEGRATION_TEST_SUITE.coverage.modules.join(', ')}
Test Types: ${INTEGRATION_TEST_SUITE.coverage.testTypes.join(', ')}
Real Data Usage: ${INTEGRATION_TEST_SUITE.coverage.realDataUsage ? 'YES' : 'NO'}
Mock Usage: ${INTEGRATION_TEST_SUITE.coverage.mockUsage ? 'YES' : 'NO'}
==============================================
`);