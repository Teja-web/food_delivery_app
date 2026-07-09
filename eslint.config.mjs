import reactPlugin from "eslint-plugin-react";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.ts", "src/**/*.tsx"],
  })),
  {
    // Relax TS rules that are too noisy for this codebase
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "prefer-const": "off",
    },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { react: reactPlugin },
    rules: {
      // Enforce shared UI components over raw HTML elements
      "react/forbid-elements": [
        "error",
        {
          forbid: [
            { element: "input", message: "Use <Input> from @/components/ui/input instead." },
            { element: "textarea", message: "Use <Textarea> from @/components/ui/textarea instead." },
            { element: "button", message: "Use <Button> from @/components/ui/button instead." },
            { element: "label", message: "Use <Label> from @/components/ui/label instead." },
            { element: "select", message: "Use <Select> from @/components/ui/select instead." },
            { element: "dialog", message: "Use <Dialog> from @/components/ui/dialog instead." },
          ],
        },
      ],
    },
  },
  {
    // Exempt the UI components themselves — they must use raw elements
    files: ["src/components/ui/**/*.tsx"],
    plugins: { react: reactPlugin },
    rules: {
      "react/forbid-elements": "off",
    },
  },
  {
    // lead-form uses native <select> for form submission
    files: ["src/app/(marketing)/get-started/lead-form.tsx"],
    plugins: { react: reactPlugin },
    rules: {
      "react/forbid-elements": [
        "error",
        {
          forbid: [
            { element: "input", message: "Use <Input> from @/components/ui/input instead." },
            { element: "textarea", message: "Use <Textarea> from @/components/ui/textarea instead." },
            { element: "button", message: "Use <Button> from @/components/ui/button instead." },
            { element: "label", message: "Use <Label> from @/components/ui/label instead." },
            // native <select> allowed here for form submission
            { element: "dialog", message: "Use <Dialog> from @/components/ui/dialog instead." },
          ],
        },
      ],
    },
  },
];
