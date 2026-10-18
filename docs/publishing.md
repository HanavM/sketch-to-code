# Publishing 0.1.0 to npm (s2c-048)

The owner runs this himself. The gardener never publishes. Prepared
2026-10-18 after the owner said yes (MIT, claim the scope, public source).

## What was prepared on `seed2tree`

- `LICENSE` (MIT, "Copyright (c) 2026 Hanav") at the root and in each package.
  Edit the name line if you want it to read differently.
- Every published package.json has `license`, `repository` (with
  `directory`) and `engines.node` (`^20.19.0 || >=22.12.0`, the same as Vite 7).
- Internal deps went from `"*"` to `"^0.1.0"`. On npm, `*` means "any
  version ever published", including a breaking 1.0 next year.
- `bin` paths no longer start with `./`. npm was rewriting them at publish time.
- `npm publish --dry-run` passed for all 8 packages on 2026-10-18:

| package | files | size |
|---|---|---|
| @s2c/dom | 18 | 7.5 kB |
| @s2c/ink | 70 | 40.3 kB |
| @s2c/providers | 22 | 9.6 kB |
| @s2c/intent | 18 | 10.3 kB |
| @s2c/overlay-client | 10 | 164.5 kB |
| @s2c/pipeline | 182 | 398.4 kB |
| @s2c/vite-plugin | 46 | 81.8 kB |
| sketch-to-code (the CLI) | 59 | 49.7 kB |

On 2026-10-18, `npm view` returned 404 for both `sketch-to-code` and `@s2c/dom`,
so the names were free that day.

## What you run (about 10 minutes)

1. Merge `seed2tree` into `main` first, so what you publish is what's in the repo.
2. Claim the scope: sign in at npmjs.com, then **Add Organization** and name
   it `s2c` (free for public packages). If someone took it, rename the
   packages before anything else. `init` installs `@s2c/vite-plugin`, so
   whoever owns `@s2c` controls what every user gets.
3. Turn on 2FA for publishing on that account.
4. From a clean checkout of `main`:

```sh
npm ci && npm run build && npm test
npm login
# leaves first: each package's deps must exist on npm before it does
for p in dom ink providers intent overlay-client pipeline vite-plugin cli; do
  (cd packages/$p && npm publish --access public) || break
done
```

5. Check it the way a user would, in an empty folder:
   `npm create vite@latest t -- --template react-ts && cd t && npx sketch-to-code init --yes && npm run dev`.
   `npm run e2e:published` already rehearses this against a local registry
   (s2c-047), but a real registry is the only proof.

## Things to know before you press it

- **Published source is public.** The tarballs hold the built JS and the
  overlay's TypeScript source. A private GitHub repo doesn't change that.
- **You can't take it back.** npm only allows unpublish within 72 hours,
  and the version number is burned forever. Fixes go out as 0.1.1.
- The README's install section says "not on npm yet". Change it once
  step 5 passes.
