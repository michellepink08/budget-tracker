# Plan 27 — Cross-Feature Conversational Commands (Roadmap)

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` section G. **Depends on:** Plan 22 (Year Plan), Plan 23 (Shopping) for the data these commands read/write — this plan only adds parser/answer wiring once those exist, same as how `restricted_fund_balance` was added to Quick Capture only after Phase 8's schema existed.

**Status:** Awaiting approval.

**Explicitly omitted (already shipped, not touched):** the deterministic parser's clause-splitting, alias resolution, `QuickCapturePanel`, `QuickCaptureLog`/Undo, the entire confirm workflow, every existing intent/question type.

## Phase 27.1 — Shopping commands

- New `CommandDraft` intents: `shopping_list_add` ("Add rice and milk to my shopping list"), `shopping_list_select` ("Mark rice and chicken for the next trip"), `shopping_schedule` ("Schedule grocery shopping for Saturday" / "Move the shopping schedule to Sunday").
- Item-name resolution reuses the existing alias-matching pattern (`resolveAlias`/`findMentionedRef`-style) against `ShoppingCatalogItem`, per the design doc.
- New `question` type: `shopping_selected_total` ("How much is my selected shopping list?").
- All data-changing intents go through the existing confirm/Undo pipeline unchanged.

## Phase 27.2 — Year Plan commands

- New `question` types: `year_plan_recommended_saving` ("How much should we save before he comes home?"), reading the active plan's `computeRecommendedSavingPerCutoff`.
- "Papa will probably be home by December" / "We have three full salary cutoffs left" — these read as **updates to plan assumptions** (a phase date, a cutoff count), not pure questions; this phase's detailed plan pins down whether they map to a new `year_plan_update_assumption`-style data-changing intent (going through confirm/Undo like any other correction) or are deferred as UI-only edits for now — flagged as an open question below since it affects scope meaningfully.
- "Show the conservative Year Plan" — a navigation command, not a data question; out of `answerQuestion`'s scope. If Quick Capture should support this, it needs a new client-side "navigate" result type distinct from a `QuestionAnswer`, which is a small but real addition to the panel's contract (currently every parsed draft is either an executable command or a `question` answered inline) — flagged for your confirmation before this phase starts, since it's the one place this plan touches `QuickCapturePanel` at all.

## Open questions before Phase 27.1 starts

1. Whether "Papa will probably be home by December" should be a confirmable data-changing command (updating a `YearPlanPhase` date) or is out of scope for voice/text entry in this pass (edited only via the Year Plan page's own UI).
2. Whether Quick Capture should gain a "navigate" result type for commands like "Show the conservative Year Plan," or such phrasings are simply not supported by Quick Capture in this pass (the Year Plan page's own scenario switcher remains the only way to view it).
