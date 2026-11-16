// ESLint 10 flat config. TypeScript/TSX files are intentionally excluded until
// a TypeScript parser is added as a locked development dependency.
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      ".git/**",
      ".next/**",
      "build/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-duplicate-imports": "error",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];
