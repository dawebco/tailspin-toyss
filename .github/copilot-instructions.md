# Tailspin Toys Crowd Funding Development Guidelines

This is a crowdfunding platform for games with a developer theme. The application is a single **Astro 7** site (fully prerendered/static output) styled with **Tailwind CSS v4**. Data is stored in a local SQLite database accessed at build time through **Drizzle ORM + Node.js's built-in SQLite driver**; pages query the database directly in frontmatter — there is no separate backend API or client-side UI framework. Please follow these guidelines when contributing:

## Agent notes

- Explore the project before beginning code generation
- Create todo lists for long operations
  - Before each step in a todo list, reread the instructions to ensure you always have the right directions
- Always use instructions files when available, reviewing before generating code
- Do not generate summary markdown files upon completion of a task
- Always use absolute paths when running scripts and BASH commands
- **NEVER commit or push to main automatically unless explicitly instructed to do so**

## Code standards

### Comments and Documentation

- Comment intent, not mechanics. Explain why a non-obvious decision or constraint exists; do not restate what the code already expresses.
- Keep comments short, specific, and close to the code they explain. Prefer clearer names and structure over explanatory comments.
- Treat stale comments as bugs: update or remove them whenever the related code changes.
- Every exported function in `db/` and `src/lib/` must have TSDoc/JSDoc describing its purpose, parameters, and return value. Document the injectable `db` parameter explicitly for data-access helpers.
- Every reusable `.astro` component must document its `Props` interface so its public contract is clear.

### Required Before Each Commit

#### Testing guidelines

- **Always run tests and lint through the `quality-checks` skill — never invoke `npm run test:unit`, `npm run test:e2e`, or `npm run lint` directly.** The skill wraps environment setup, ordering, and troubleshooting. (Starting the app for manual validation is not a quality check — run `npm run dev` directly for that.)
- Run Vitest unit tests to verify the data layer and transforms, and Playwright tests to verify e2e and frontend functionality
- Run ESLint to check frontend code quality before committing
- Review the existing tests to ensure we're not duplicating efforts
- Test code should be of the same quality as the rest of the project, and follow DRY principles
- For frontend changes, verify the build (`npm run build`) directly, and run the end-to-end tests through the `quality-checks` skill, to ensure everything works correctly
- When changing the data layer (schema, helpers, transforms), update and run the corresponding unit tests

#### Project guidelines

- When updating the database schema, generate and commit the drizzle-kit migration (`npm run db:generate`)
- When adding new functionality, make sure you update the README
- Make sure all guidance in the Copilot Instructions file is updated with any relevant changes, including project structure, scripts, comments, documentation, and programming guidance.

### Code formatting requirements

- Use TypeScript with explicit types for function parameters and return values, especially in the data layer (`db/`, `src/lib/`).
- Use single quotes, semicolons, four-space indentation, and trailing commas in multiline TypeScript. Keep imports and type annotations readable; do not use formatter overrides to bypass the shared style.
- Frontend code (TypeScript, Astro) must pass ESLint checks (`npm run lint`). ESLint enforces the repository's semicolon, quote, comma, spacing, and final-newline rules; four-space indentation and documentation requirements are reviewed in code review.

### Data Layer Patterns (Drizzle + Node SQLite)

- Define tables in `db/schema.ts`; manage schema changes with drizzle-kit migrations - see `drizzle.instructions.md`
- Keep data-access helpers in `src/lib/` with an **injectable `db`** argument so they're testable
- Keep CSV/seed logic as pure functions in `db/transforms.ts`
- Seed-derived values must be deterministic (no `Math.random`) so static builds are reproducible

### Astro Patterns

- **Astro Pages/Components**: routing, layouts, content, and components are all `.astro` - see `astro.instructions.md`
- Query data directly in page frontmatter via the `src/lib/` helpers (build-time, static output)
- Dynamic routes use `getStaticPaths()` + `export const prerender = true`
- Provide a branded `404.astro` (unknown routes are real 404s under static output)
- Only add a scoped Astro `<script>` when genuine client interactivity is required

### Styling

- Use Tailwind CSS utility classes exclusively - see `style.instructions.md`
- Dark theme colors: slate palette (`bg-slate-800`, `text-slate-100`, etc.)
- Rounded corners and modern UI patterns
- Follow modern UI/UX principles with clean, accessible interfaces

### GitHub Actions workflows

- Follow good security practices
- Make sure to explicitly set the workflow permissions
- Add workflow comments only when they explain why a task or permission is required; do not narrate the steps the workflow syntax already makes clear.

## Scripts

- The project uses **npm scripts** for all development tasks — there is no `scripts/` directory.
- **Skills take precedence.** Before running a command directly, check whether a skill covers the task (e.g. the `quality-checks` skill wraps tests and lint). If one applies, follow it.
- Key npm scripts:
  - `npm run dev` — start the Astro dev server (`predev` migrates + seeds the local SQLite database)
  - `npm run build` — build the static site (`prebuild` migrates + seeds the local SQLite database)
  - `npm run preview` — serve the built `dist/` output
  - `npm run lint` — ESLint
  - `npm run test:unit` — Vitest unit tests
  - `npm run test:e2e` — Playwright E2E tests (builds + previews first)
  - `npm run typecheck` — type-check the pure TypeScript with `tsgo` (TypeScript 7 native compiler, via `@typescript/native-preview`) using `tsconfig.tsgo.json`
  - `npm run typecheck:astro` — type-check `.astro` files with `astro check` (classic TypeScript package)
  - `npm run typecheck:all` — run both type-check scripts (used by the CI `type-check` job)
  - `npm run db:generate` / `db:migrate` / `db:seed` / `db:setup` — Drizzle schema/migration/seed tasks
  - `npm run db:export` — migrate and seed via `predb:export`, then write the catalog grounding file to `db/catalog.json`

> [!NOTE]
> TypeScript 7 (`tsgo`) is adopted **side-by-side** for type checking only; it does not affect linting. ESLint + `typescript-eslint` and `astro check` still resolve the classic `typescript` package (kept at v6) because the native compiler's API isn't ready for them yet. Do **not** bump the classic `typescript` package to 7 (a Dependabot `ignore` holds it) until `typescript-eslint` + `@astrojs/check` support the native API. `tsgo` is `--noEmit` only; the site is still built by `astro build`.

## Repository Structure

The application lives at the repository root:

- `db/`: Drizzle schema, migrations, transforms, seed, and `games.csv`
- `src/lib/`: Node SQLite client (`db.ts`) and data-access helpers (`games.ts`)
- `src/components/`: reusable `.astro` components
- `src/layouts/`: Astro layout templates
- `src/pages/`: Astro page routes (`index.astro` listing, `game/[id].astro`, `404.astro`, `about.astro`)
- `src/styles/`: CSS and Tailwind configuration
- `src/types/`: TypeScript interfaces (Game, Publisher, Category)
- `e2e-tests/`: Playwright E2E tests (home, games, accessibility)
- `drizzle.config.ts`, `vitest.config.ts`, `astro.config.mjs`, `playwright.config.ts`: tooling config
- `README.md`: Project documentation
