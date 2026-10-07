# Design QA

- source visual truth: `/Users/drakebartolai/.codex/generated_images/01a117c3-ef2a-7a20-907b-a049cab50c63/exec-3b442a10-61a8-4c57-aa5a-dc0210847a53.png`
- implementation screenshots:
  - `.artifacts/final-home/localhost-after-2026-10-07T19-57-38.png`
  - `.artifacts/final-history/history-after-2026-10-07T19-57-41.png`
  - `.artifacts/final-mobile/history-after-2026-10-07T19-57-45.png`
- combined comparison: `.artifacts/design-qa/source-home-final.png`
- focused hero comparison: `.artifacts/design-qa/source-home-hero-focus.png`
- viewport: desktop 1440 × 1000 CSS px; Record Book 1440 × 1100; mobile 375 × 812
- source pixels: 1487 × 1058; implementation pixels match CSS size at device scale factor 1
- normalization: source scaled proportionally to 1440 px wide and both images padded to 1440 × 1100 before horizontal comparison
- state: real 2026 ESPN homepage, all-time Record Book, and 2024 filtered Record Book

## Findings

No actionable P0, P1, or P2 differences remain for the requested hybrid design direction and Record Book scope.

- Fonts and typography: the Iowan Old Style/Baskerville editorial stack recreates the high-contrast newspaper hierarchy while the system sans stack keeps tables dense and readable. The implementation retains slightly heavier display text than the mock, an acceptable browser-font variation.
- Spacing and layout rhythm: the cream Chronicle lead, navy ledger, white data cards, and two-column dashboard preserve the mock's editorial-to-utility rhythm. The homepage deliberately uses a full-width Chronicle instead of the mock's signed-in team rail because team authentication is not part of this increment.
- Colors and visual tokens: navy, cobalt, cream, red, sage, green, and gold map closely to the source. Borders and shadows stay intentionally restrained.
- Image quality and asset fidelity: the requested Record Book needs no photographic or illustrative asset. Team badges use data-derived initials; no source artwork was replaced with a hand-drawn approximation.
- Copy and content: every visible record, score, team, owner, champion, and season total comes from the real ESPN archive. Unbuilt Chronicle, Trade Room, and Payouts destinations are visibly disabled instead of acting as dead links.
- Responsiveness and accessibility: desktop and 375 × 812 captures show no horizontal page overflow. Navigation, table semantics, form labels, focus styles, reduced-motion handling, and the skip link are present.

## Comparison history

1. First pass: the restyled homepage matched the palette but lacked the source's dominant editorial story and felt too sparse above the fold (P2).
2. Fix: added a real-data 2026 Chronicle lead, score treatment, and Record Book call to action; tightened the editorial font stack.
3. Post-fix evidence: `.artifacts/design-qa/source-home-final.png` and `.artifacts/design-qa/source-home-hero-focus.png` show the restored editorial hierarchy. The all-time and mobile Record Book captures show the same system carried into dense historical data.

Focused comparison was required for the masthead, Chronicle typography, score treatment, and primary action; those details are visible in the focused hero image. Dense Record Book tables were reviewed separately in the 1440 × 1100 implementation capture.

## Runtime verification

- primary interactions: opened `/history`, selected 2024, submitted the filter, and verified 1 season / 80 matchups / 20,140 points
- console errors and warnings: none in the in-app browser
- automated checks: tests, typecheck, lint, and production build passed
- screen-recording caveat: the bundled recorder could not burn annotations because the installed FFmpeg lacks the `ass` filter; numbered desktop/mobile screenshots and interaction assertions were used instead

final result: passed
