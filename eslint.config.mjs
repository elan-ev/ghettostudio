import opencastConfig from "@opencast/eslint-config-ts-react";
import tseslint from "typescript-eslint";
import stylisticTs from "@stylistic/eslint-plugin-ts";

export default [
  ...opencastConfig,

  {
    plugins: {
      "@stylistic/ts": stylisticTs,
    },
  },

  // Fully ignore some files
  {
    ignores: ["build/"],
  },

  // This TS file is not part of the project.
  {
    files: ["webpack.config.ts"],
    ...tseslint.configs.disableTypeChecked,
  },

  // Temporarily disable new lints, fix them later
  {
    rules: {
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
];
