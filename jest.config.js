/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    moduleNameMapper: {
        // the native binding is not loadable in a test run
        '^node-snap7$': '<rootDir>/test/stubs/node-snap7.ts'
    },
    clearMocks: true
};
