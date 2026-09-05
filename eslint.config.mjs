// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts', 'test/**/*.ts'],
        rules: {
            // carried over from tslint.json
            'no-bitwise': 'off',
            'no-console': 'off',
            'max-classes-per-file': 'off',
            quotes: ['error', 'single', {avoidEscape: true, allowTemplateLiterals: true}],
            // tslint:recommended did not enable no-any
            '@typescript-eslint/no-explicit-any': 'off'
        }
    },
    {
        files: ['test/**/*.ts'],
        languageOptions: {
            globals: {
                describe: 'readonly', it: 'readonly', expect: 'readonly', jest: 'readonly',
                beforeAll: 'readonly', afterAll: 'readonly', beforeEach: 'readonly', afterEach: 'readonly'
            }
        }
    }
);
