# JBO Labs Mailflare

This is JBO Labs' maintained fork of [hieunc229/mailflare](https://github.com/hieunc229/mailflare). It powers our own installation; changes here do not require upstream acceptance. Upstream history, attribution and licensing remain intact.

The JBO addition is OAuth for the existing MCP server: see [MCP OAuth](docs/mcp-oauth.md). The fork uses the app's existing Cloudflare/Node toolchains. Infrastructure remains owned by Alchemy in the private `jbolabs/jbolabs` repository, which pins a reviewed commit of this fork as its `mailflare/` submodule. This fork's CI builds and tests; it does not deploy.

Make application changes through PRs targeting **jbolabs/mailflare:main**. After merging, update the submodule pin in `jbolabs/jbolabs` through a separate PR. A merged source or pin PR does not deploy Mailflare. Deployment and database migration are separate operator actions.

To import upstream changes, fetch `hieunc229/mailflare` into an `upstream` remote and merge a chosen revision on a branch. Resolve conflicts, preserve local features, and run verification before opening a PR against this fork. Never replace the fork's tracked tree or reset its maintained branch to upstream. The dashboard tree-replacement workflow is disabled in this repository; downstream installation repositories default their update source to this fork.

The `MCP OAuth` workflow checks the OAuth, backup and admin integration tests, TypeScript, and both production builds without cloud credentials. The inherited full test suite has pre-existing locale-catalog gaps, and inherited full lint has unrelated findings; the focused gate does not claim those are clean.
