# UI hill-climb rubric

Score each page on each axis from 0 to 10. Phone (standalone home-screen app, 430×932) and desktop (1440×900) count equally: score each viewport and average them. Light and dark are one viewport; a defect in either counts.

| Axis | 10 looks like | 4 looks like |
| --- | --- | --- |
| **Hierarchy** | One obvious primary action and focal point; secondary actions recede; headings, metadata and body are clearly ranked. | Several things compete; the primary action is unclear or buried. |
| **Layout & rhythm** | Consistent spacing scale, aligned edges, intentional density, no dead zones or cramped clusters, safe areas respected on phone. | Uneven gaps, misaligned columns, wasted space, content under the status bar or home indicator. |
| **Typography & colour** | Restrained type scale, comfortable measure and leading, sufficient contrast in both schemes, colour carries meaning instead of decoration. | Too many sizes or weights, low-contrast text, links and labels that look alike. |
| **Motion** | Every state change that moves things spatially has motion that explains it (where it came from and where it went), 150–300ms, ease-out or springs, composited properties only, interruptible, and calm under reduced motion. Nothing animates that shouldn't (keyboard-driven actions, frequent actions). | Hard cuts on spatial navigation, layout-property animation, ease-in on entry, >400ms, or motion that still slides under reduced motion. |
| **Native feel (phone)** | Behaves like an installed app: a visible way back on every screen, thumb-reachable primary actions, no hover-only affordances, touch targets ≥ 44px, press feedback. | Website-in-a-frame: tiny targets, actions only at the top, no feedback on press. |
| **States** | Empty, loading, error and long-content states are designed, not defaults. | Blank areas, raw errors, spinners for everything, layout jumps when data arrives. |
| **Accessibility** | Hard metrics clean; focus visible; labels on icon buttons; reading order matches visual order. | Unlabelled icon buttons, invisible focus, colour-only meaning. |

Hard metrics in `metrics.json` (axe, CLS, overflow, failed requests, long frames, transform animations under reduced motion) are a gate, enforced by `compare.mjs`. They are not part of the score.

## Pairwise judging (accepting a step)

Absolute scores drift between judges, so a step is accepted on a **blind pairwise** comparison. The judge gets two captures labelled `A` and `B` in random order and is not told which one is the change. For each axis it answers `A`, `B` or `same`, then gives an overall preference. Accept the step only if the change wins overall and loses no axis.

Absolute scores are only used to choose what to climb next: the page and axis with the lowest score.
