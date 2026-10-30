---
name: ui-hill-climb
description: Hill-climb the UI/UX and motion of one page group (mail, compose, settings, admin, calendar, drive, auth). Captures screenshots, filmstrips and hard metrics, scores against a rubric, makes one change at a time and keeps it only if a blind pairwise judge prefers it and no metric regresses. Use when asked to improve, polish or optimise the UI of a page group, or to "run the hill climb".
---

# UI hill climb

One run climbs one page group from `scripts/ui-scan/pages.mjs` (which must cover every page route; `tests/ui-scan-coverage.test.mjs` enforces it). Rank work by pages improved × severity: a fix in a shared component (`src/components/ui/*`, `AppTopBar`, shells) beats a one-page polish.

## Setup

1. Dev server on a free port (`npm run dev -- --port 3017`). On a fresh worktree apply migrations first (`yes | npx wrangler d1 migrations apply DB --local`) and then `curl -X POST localhost:3017/api/seed`.
2. Branch `ui-climb/<group>` from `main`.
3. Baseline: `scripts/ui-scan/capture-base.sh base-0 <group>`. It sets uncommitted `src/` work aside, so a baseline is always clean (the gate refuses dirty ones). Omit the group to capture every group; do that for any change to a shared component, since a one-group capture missed a regression elsewhere once.

## Score the baseline

Spawn a fresh subagent as the **scorer**. Give it `scripts/ui-scan/rubric.md`, the paths to every screenshot, each interaction's `sheet.png`, and `metrics.json`. Do not tell it what you plan to change. It returns per-page, per-axis scores with one sentence of evidence each. Append the scores to `docs/ui-hill-climb/log.jsonl` as `{"group","step":0,"kind":"score",...}`.

## Climb (repeat up to ~8 steps, or until three steps in a row are rejected)

1. **Pick** the lowest page × axis. Use the skill that fits the axis: `animate` / `review-animations` / `animation-performance` for motion, `emil-design-eng` / `impeccable` for hierarchy, layout and type, `mobile-native` / `apple-design` for native feel, `break-ui` for states, `web-design-guidelines` for accessibility.
2. **Change one thing.** Keep it small enough to describe in one line. Fix shared components rather than a single page when the defect repeats.
3. **Checks:** `npm run lint`, `npm run format:check`, `npx tsc --noEmit`, `npm test`. A failure is a rejected step.
4. **Capture** `npm run ui:capture -- --group <group> --label step-<n>` and run `npm run ui:compare -- --group <group> --base <baseline> --head step-<n>`. FAIL means rejected, unless the failure is reproducible noise (rerun once; dev-server reloads cause WebSocket and 503 errors).
5. **Blind judge.** Spawn a fresh subagent with the rubric's pairwise section and the two captures as `A` and `B`, in a random order you record and do not reveal. Accept only if the change wins overall and loses no axis.
6. **Accepted:** commit with the one-line description. **Rejected:** `git checkout -- src`. Either way, log it with `node scripts/ui-scan/log.mjs '{"group","step","change","gate","judge","accepted"}'`.

An objective fix (a hard cut, a rubric rule, an a11y or layout bug the scorer named) may skip the judge; say so in the log. Judgement calls go to the judge.

The proposer never judges its own change. That separation is what makes this a climb rather than self-approval.

## Finish

Rescore the final capture with a fresh scorer and log it. Open the PR with `file-pr`: before/after scores per axis, one line per accepted step, and before/after images for the biggest wins (commit those images under `docs/ui-hill-climb/<group>/`; `.ui-scan/` is gitignored). Shut down the dev server.
