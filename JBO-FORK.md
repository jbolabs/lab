# Lab by JBO Labs

This is JBO Labs' maintained fork of [hieunc229/mailflare](https://github.com/hieunc229/mailflare). It powers our own installation; changes here do not require upstream acceptance. Upstream history, attribution and licensing remain intact.

The fork provides OAuth for the MCP server: see [MCP OAuth](docs/mcp-oauth.md). It also owns the inbox installation through Alchemy; see [deployment](docs/jbo-deployment.md). Shared studio domain infrastructure stays in `jbolabs/jbolabs`.

Make application and infrastructure changes through PRs targeting **jbolabs/lab:main**. Every merge to `main` deploys prod through CI once lint, types, tests and the Node build pass, and the deploy applies pending migrations.

To import upstream changes, fetch `hieunc229/mailflare` into an `upstream` remote and merge a chosen revision on a branch. Resolve conflicts, preserve local features, and run verification before opening a PR against this fork. Never replace the fork's tracked tree or reset its maintained branch to upstream. The dashboard tree-replacement workflow is disabled in this repository; downstream installation repositories default their update source to this fork.

The `Lab` workflow (`.github/workflows/lab.yml`) runs full lint, formatting, TypeScript, the whole test suite and the Node build on every PR, without cloud credentials.
