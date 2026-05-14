// Spread the ori-generated arch config (run `pnpm arch:export` to regenerate
// `eslint.config.ori.js` from `.ori/architecture.md`) and add your project
// rules below.

import oriArch from "./eslint.config.ori.js";

export default [
  ...oriArch,
  {
    rules: {
      // your project rules here
    },
  },
];
