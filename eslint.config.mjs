import { defineConfig, globalIgnores } from "eslint/config";
import typescriptEslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...typescriptEslint.configs.recommended,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
