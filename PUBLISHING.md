# Publishing Updates to npm

This document describes the workflow for publishing a new version of `react-state-object` to npm.

## Prerequisites

- npm account with publish access to the package
- Logged in locally: `npm login`
- Clean working tree (recommended): `git status`

## Release Workflow

1. Update the code and docs

- Make your changes
- Update `README.md` if the public API or behavior changed

2. Install dependencies

```bash
npm install
```

3. Validate the package locally

```bash
npm run build
```

Notes:
- `prepublishOnly` already runs `npm run clean && npm run build` during publish
- If you add tests/lint checks, run them here before publishing

4. Bump the version

Choose one:

```bash
npm version patch
npm version minor
npm version major
```

This updates `package.json` (and `package-lock.json`) and creates a git commit + tag by default.

5. Review what will be published (recommended)

```bash
npm publish --dry-run
```

Check that only the expected files are included (`dist/` and `README.md`, based on the current `files` field).

6. Publish to npm

```bash
npm publish
```

If this package is ever moved to a scoped name and needs a public first publish, use:

```bash
npm publish --access public
```

## After Publishing

1. Push commits and tags

```bash
git push
git push --tags
```

2. Verify the published package

- Check the package page on npm
- Optionally test install in a separate project:

```bash
npm i react-state-object@latest
```

## Troubleshooting

- `403 Forbidden`: your npm account may not have publish access
- `You cannot publish over the previously published versions`: bump the version and publish again
- Missing build output: run `npm run build` and confirm `dist/` exists before publishing
