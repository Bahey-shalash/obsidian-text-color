module.exports = {
    preset: 'ts-jest/presets/js-with-ts',
    testEnvironment: "node",
    moduleNameMapper: {
        '^obsidian$': '<rootDir>/test/__mocks__/obsidian.ts',
        '^main$': '<rootDir>/test/__mocks__/main.ts',
    },
    globals: {
        'ts-jest': {
            tsconfig: '<rootDir>/tsconfig.json',
        },
    },
    transformIgnorePatterns: [
        "node_modules/(?!troublesome-dependency/.*)",
    ],
}
