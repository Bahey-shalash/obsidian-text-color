module.exports = {
	preset: 'ts-jest/presets/js-with-ts',
	testEnvironment: "node",
	moduleNameMapper: {
		'^obsidian$': '<rootDir>/test/__mocks__/obsidian.ts',
		'^src/(.*)$': '<rootDir>/src/$1',
	},
	transform: {
		'^.+\\.[jt]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
	},
	testPathIgnorePatterns: ["/node_modules/", "/_to_delete/"],
}
