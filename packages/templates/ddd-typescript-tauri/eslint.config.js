// Spread the ori-generated arch config (run `pnpm arch:export:ts` to
// regenerate `eslint.config.ori.js` from `.ori/architecture.md`) and add
// your project rules below. The Rust root uses arch-adapter-rust instead;
// see `pnpm arch:export:rs`.

import oriArch from "./eslint.config.ori.js";

export default [
  ...oriArch,
  {
    rules: {
      // your project rules here
    },
  },
];
