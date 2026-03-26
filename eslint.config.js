import js from "@eslint/js";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettier,
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "warn",
    },
  },
  {
    ignores: ["dist/", "build/", "coverage/", "node_modules/"],
  },
];
