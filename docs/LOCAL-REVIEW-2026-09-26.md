# Local website review — 26 September 2026

Status: in progress with Jonny. This is feedback on the local desktop and mobile preview, not acceptance or publication. Keep Jonny's observations separate from proposed wording and implementation.

## Confirmed local correction

- Jonny noticed that the mobile hero joined words across the desktop-only line breaks (for example, “andmoving”). He explicitly approved correcting the hero spacing in this review conversation.
- A space was added after each hidden line break in `index.html`. The local hero was checked again at 390 px and 1440 px browser widths. This verifies that correction only; it is not acceptance of the page.

## Copy feedback to discuss

1. **Navigation:** “Ways to work” reads too much like “How it works.” Jonny suggested “How to begin” or something closer to the destination heading, “Where would you like to begin?” This is feedback, not final approved wording.
2. **Butter-coloured working-principle bar:** Jonny does not understand why “Draft, not a decision.” appears as a quotation or what it is doing there. The surrounding explanation also loses him. The page currently says, “AI can help you think. It needn’t decide what matters to you.” His first spoken impression of that line differed from the actual wording, which is useful evidence that the bar is not communicating clearly. No replacement message has been chosen.
3. **“The human remains the author” section:** The lead sentence about technology increasing human possibility “without demanding that human life reorganise itself around the technology” does not sound like Jonny. He began to describe an interest in technology facilitating human possibility without taking away personal agency or demanding undue attention, while explicitly saying that was not yet quite right. Treat his phrasing as a direction for discussion, not replacement copy.

## Assessment to bring back to Jonny

- The first navigation label should describe the choice a visitor reaches; the second should describe what a session is like. “How to begin” is a plausible first label, pending Jonny's choice.
- “Draft, not a decision.” is listed as a reusable line in the master brand system, but the site presents it as a standalone quote without a speaker or a concrete referent for “draft.” Its placement and quotation marks may make a useful idea feel like an unexplained slogan.
- The long technology sentence also appears in the brand system. That source says plain language and Jonny's actual voice take priority over a polished line. This is a reason to revisit the sentence with him, not to silently rewrite the brand source.

Next: continue the copy review at Jonny's pace. Discuss what each passage needs to help a visitor understand, then agree exact wording before changing the page. Do not treat this note as copy approval.

## Rowan copy pass — 26 September 2026

Source: Jonny's copy-review brief following discussion with Rowan, supplied directly in this task. It approves only the three example accounts as exact replacement copy. TH-005–008 in [project memory](PROJECT_MEMORY.md) record the distinct decisions and future intentions. Earlier feedback above is preserved; this section refines it.

### Approved implementation and visual check

Applied the supplied titles and paragraphs verbatim to “A community newsletter”, “Making sense of AI”, and “A community’s digital home” in `index.html`. No expanded stories, testimonials or case-study pages were added. Existing card category labels and the existing collapsed additional examples remain unchanged.

Checked in the local in-app browser at 1440 × 900 desktop and 390 × 844 mobile. Desktop retains three columns; mobile stacks the cards. All text is visible with natural wrapping, clear separation and no clipping, overlap or horizontal overflow. Body text remains 15 px with 25.5 px line height. Document scroll width equals client width at both sizes (1425 and 375 px respectively; the scrollbar uses 15 px). No CSS adjustment was needed. `node check-resources.js` passed. This verifies the changed cards, not the whole website or Jonny's acceptance.

Local screenshot evidence in the parent workspace: `review-artifacts/rowan-copy-pass/cards-desktop-1440.jpg`, `cards-mobile-390-top.jpg`, and `cards-mobile-390-bottom.jpg`. These show the local copy pass over `f44b8b9`, not a pushed version.

### Proposals only — not applied

Keep “AI is powerful, strange, and moving very fast.” and “Hello. I’m Jonathan.” The two existing paths remain. Keep “What kind of mind am I hiring?” open for discussion; there is no reason to remove its humour merely because it acknowledges hiring.

| Area | Current wording | Proposed revision | Reason |
| --- | --- | --- | --- |
| Opening lead | You don’t have to figure it all out by yourself. | Find your footing with AI, on your own terms. | Offers room and agency without assuming the visitor cannot cope alone. |
| Opening explanation | I help people understand AI, use it more confidently, and explore what it might genuinely be useful for in their lives, work and creative projects. | We’re all finding our way through these changes. I offer time to explore your questions, try things out and work out what AI might be useful for in your life, work or creative projects. | Places Jonathan within the change and makes the offer concrete. |
| What this is | Time with a human mind, with AI available as part of the toolkit. A well-held hour to think together about something that matters to you. | My time, attention and thinking, with AI available as part of the toolkit. Space to be present with what matters to you, and think together about it. | Names what is being bought and conveys presence without diminishing the offer. Avoids promising a new duration. |
| Project card boundary | I work with you on your project. I don’t take your project over. | We can think, explore and make things together. We’ll agree what I take on and what stays in your hands. | Clarifies collaboration and agreed responsibility without ruling out a larger role. |
| Practical FAQ: Do you do the work for me? | We can explore and build things together during a session, but this isn’t an outsourced project service. The project and its decisions remain yours. | We can explore and build things together during a session. I also consider larger projects when I have the capacity and the work feels meaningful, with values and ethical boundaries we can agree on. We would discuss the scope and responsibilities before deciding to work together. | Keeps sessions as the clear offer; larger projects depend on fit and an explicit agreement. |
| Working-principle bar | A working principle / “Draft, not a decision.” / AI can help you think. It needn’t decide what matters to you. | A working principle / AI can help you think further or wider. / It needn’t decide in which direction. | Uses Jonny’s suggested direction. Present as a statement without quotation marks or implied attribution. |
| Philosophy lead | I’m interested in technology that increases human possibility without demanding that human life reorganise itself around the technology. | I’m interested in technology that helps us grow, develop and learn, and enriches our lives, our relationships and the natural world. | States what the technology should serve in direct, personal language. |
| Philosophy middle | I don’t think every useful application of AI has to make somebody richer, faster or more productive. Sometimes the value is creative. Sometimes it is understanding. Sometimes it is removing drudgery so people have more attention for one another. | Making something, caring for someone, communicating more clearly or sharing a gift can all be worthwhile outcomes. So can removing drudgery, leaving us with more attention for one another. | Gives concrete value beyond productivity, while retaining the existing point about attention. |
| Philosophy close | People should remain the authors of their own values, choices and meaning. AI can help. It shouldn’t quietly take that job over. | Our values, choices and sense of meaning remain ours. AI can help us explore possibilities; we decide what matters and where to go. | Expresses human authorship positively and connects it to the proposed bar. |
| AI-authority FAQ, final sentence | “Draft, not a decision” is a useful habit. | Treat what AI offers as something to consider. The judgement stays with you. | Removes the repeated unexplained slogan while retaining the preceding practical advice about sources and putting results in one's own words. |

### Conflicts and open decisions

- The categorical project-service restrictions and older philosophy wording also appear in the brand master. Jonny's new direction refines them, but exact replacements remain proposals; the master has not been edited.
- The proposed bar and the FAQ should be considered together so the unclear slogan does not survive elsewhere by accident.
- Two-hour sessions at £60 / £100 / £140 are recorded as a future intention, conditional on suitable space around them. The site and booking specification currently assume 60-minute sessions. Availability, buffers, notifications and duration's treatment in capacity and solidarity economics need explicit design. No booking files or rules were changed.
- “Ways to work” versus “How to begin” remains unresolved from the earlier review. Navigation, page length and route to booking belong in the intended calm, inventive experience discussion; no redesign was performed.
- The two existing collapsed extra examples remain as they were. Jonny's instruction prevents adding expanded stories/testimonials/pages; it has not been interpreted as an instruction to delete existing material.

Changes in this pass remain local and uncommitted on `rebuild/brand-system-v1`; no push, merge, publication or PR readiness change. Existing booking implementation and intake-workflow drafts were preserved.
