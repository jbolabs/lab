# Lab by JBO Labs

This is JBO Labs' maintained fork of [hieunc229/mailflare](https://github.com/hieunc229/mailflare). It powers our own installation; changes here do not require upstream acceptance. Upstream history, attribution and licensing remain intact.

The fork provides OAuth for the MCP server: see [MCP OAuth](docs/mcp-oauth.md). It also owns the inbox installation and release workflow through Alchemy; see [deployment and the state-preserving ownership handoff](docs/jbo-deployment.md). Shared studio domain infrastructure stays in `jbolabs/jbolabs`.

Make application and infrastructure changes through PRs targeting **jbolabs/lab:main**. There is no parent submodule-pin release step after the handoff. Production is disabled by default; only a separately authorized CI bootstrap and enablement allows verified main pushes to deploy. Database migrations remain separate operator actions.

To import upstream changes, fetch `hieunc229/mailflare` into an `upstream` remote and merge a chosen revision on a branch. Resolve conflicts, preserve local features, and run verification before opening a PR against this fork. Never replace the fork's tracked tree or reset its maintained branch to upstream. The dashboard tree-replacement workflow is disabled in this repository; downstream installation repositories default their update source to this fork.

The `MCP OAuth` workflow checks the OAuth, backup and admin integration tests, TypeScript, and both production builds without cloud credentials. It also checks deployment types, release guards and preserved mail-domain boundaries. The inherited full test suite has pre-existing locale-catalog gaps, and inherited full lint has unrelated findings; the focused gate does not claim those are clean.
