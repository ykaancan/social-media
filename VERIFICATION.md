# Build verification

## UI polish Steps 2–4 — 2026-09-16

- Step 2 audit and implementation plan: `reviews/ui-2026-09-15/UI-POLISH-PLAN.md`.
- Steps 3 and 4 implemented; results and screenshots are in the corresponding
  `step3/RESULTS.md` and `step4/RESULTS.md` under that review directory.
- Latest frontend result: **384 tests across 43 suites**, TypeScript passed.
- Web, Android and iOS production bundle exports passed. These are compilation
  checks, not native builds or device sign-off.
- Backend source unchanged; the Step 1 result below remains 294 passing tests.
- Remaining: native keyboard, screen-reader, large-text and safe-area checks;
  complete authenticated visual walkthrough against the live backend; tablet
  and physical projector checks. Release blockers remain in `RELEASE.md`.
- Historical per-step notes describe their state at completion. This work is
  being submitted together on `codex/mvp-ui-polish`; it is not release sign-off.

## Readiness Step 1 results — 2026-09-14

- Clean lockfile install: 924 packages; no dependency or lockfile changes.
- TypeScript: passed.
- Jest: 381 tests, 42 suites passed.
- Backend: 294 tests, zero failures, errors or skips; all build tasks rerun
  with Java 21 and Docker 28.3.2.
- Both workflow files parse as YAML and have unfiltered pull-request triggers.
- Whitespace validation: passed.

Not done: GitHub workflow execution, branch-rule configuration, native builds,
device review, deployment or UI changes. No product-contract deviations were
introduced. Existing release gaps remain tracked in `RELEASE.md`.

## Frontend

Use Node.js 22.14.0 (the version pinned in frontend CI). From `app/`:

```sh
npm ci --no-audit --no-fund
npm run typecheck
npm test -- --ci --runInBand
```

`npm ci` restores the committed lockfile without upgrading dependencies. If an
install is interrupted, rerun it before interpreting missing modules or missing
`jest`/`tsc` executables as source failures. Close development servers first if
Windows reports locked dependency files. In a restricted environment, use a
writable npm cache and allow access to the package registry.

## Backend

Start Docker and use Java 21. From `backend/`:

```sh
./gradlew test --no-daemon --rerun-tasks
```

On Windows use `./gradlew.bat`. If Gradle resolves its cache to an unwritable
location such as `C:/.gradle`, explicitly set `GRADLE_USER_HOME` to a writable
directory. A PowerShell example using the user's normal cache:

```powershell
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE '.gradle'
.\gradlew.bat test --no-daemon --rerun-tasks
```

Set `JAVA_HOME` to the installed JDK 21 directory if necessary. Ensure `docker`
resolves to the Docker Desktop executable; a shadowing executable on PATH can
fail before reaching Docker. The integration suite creates its own disposable
PostgreSQL database and applies Flyway migrations.

## GitHub merge requirements

The `frontend` workflow installs the lockfile, checks TypeScript and runs Jest.
The `backend` workflow runs the integration suite and builds the server image.
Both run on every pull request, avoiding skipped required checks caused by path
filters. After their first successful GitHub runs, configure branch protection
or a branch ruleset to require `frontend checks` and `gradle test`.

Local success does not prove the GitHub runner passed. Repository rules and
workflow runs must be checked after pushing. Bundle/native build and device
validation remain separate release checks.
