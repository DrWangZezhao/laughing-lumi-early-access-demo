# Investor experience — review candidate, 3 November 2026

Developed on `feature/investor-opportunity` from main `6cba85d8405f43568cc6e38bfc291059ce555734`. No main push, live website deployment, collection-endpoint change, cloud credential change or DNS change was performed.

## Implemented

Five-section editorial investor page, original logo/mascots, original five founder portraits extracted unchanged from the supplied PowerPoint, an independently testable financial engine, five-language UI, restrained number animation, keyboard-native controls and reduced-motion behavior. Public Research page gives reviewed aggregate summaries instead of exposing case-level family feedback or private financing contacts. Homepage gets coherent Research/Investor navigation and latest deck role for Kirsi; original mascot code is unchanged except initial language selection. Existing form and endpoint remain operational as before.

`js/opportunity-model.js` owns approved dated inputs, pure calculations, constraints, formatting and reset. UI and translations are separate. Default 1,000 paying households is an illustrative user-selected scale, not a plan target or achieved adoption. 25% conversion implies 4,000 active households, all included in delivery cost. Model costs match source outputs at 80 active households and 40 minutes: A €274.40, B €61.32, C €96.60, D €139.26 per month. Net monthly seller proceeds for €9.90 are €6.70518; annual subscription €99 gives €67.05179 annual proceeds. 500,000 annual payers produce €49.5m gross and €33.525896m net after illustrative VAT/fees, not achieved ARR.

Operating model removes the complete €11,500 voice/cloud envelope from €235,000, retains €223,500 non-overlapping fixed spending, and adds delivery costs once. This is a scenario rebasing of the cash budget, not an approved revised budget or accounting profit. Above an explicitly chosen 200-active-household guardrail, operating output is withheld until the visitor supplies extra corporate cost. This guardrail is a UI modelling safeguard, not evidence of measured capacity; the source itself compares 80 active homes and a 200-enrolment target. Extra cost is clearly a visitor sensitivity assumption. Contribution excludes payroll/corporate costs. The source reserve is not an expense. Technical break-even holds the selected active cohort constant; it is not company-wide break-even. No company-wide threshold is claimed without a re-estimated scale budget.

## Actual source review and conflicts

- Pitch `1nYNL8_RxloMkPsmE7AHgMbxPdKfylvhb`, PowerPoint modified 3 November 2026: narrative and original slide 8 portraits. User explicitly directed current roles to follow this deck: Kirsi CIO, Jenni CPO, Henri CTO, Zezhao CRO, Ganesh CMO. English role abbreviations are retained across locales. No advisors added to the new investor page because association/publication consent was not independently established.
- Finance `1tkWe_iUe5zywsUDPaxgKp-TXTPLjQDY2`, 65-page combined report dated 29 October 2026, containing Budget V4.0 (23 October): complete text fetched; budget, architecture audit trail, funding baseline and source conflicts reviewed. Used the English audit trail pp.16–30 of budget (combined pp.37–51), budget and funding baseline. Historical and current finance sections have CEO/COO labels different from latest pitch; latest deck chosen per user instruction, no invented reconciliation.
- The pitch shows `hello@laughinglumi.com` but its actual mailto target is `laughinglumi@gmail.com`. Existing public website also uses the latter. Candidate keeps the actual link target; delivery owner should resolve this discrepancy before replacing it.
- Latest source financing evidence is as of 29 October and does not establish signed/cleared investment. Page explicitly dates that evidence and asks for current confirmation.
- 200+/10+/500+ predecessor-project metrics lack original study dates in the deck and are not displayed as current Lumi traction. No paid adoption inferred.
- Existing old investor page and open PR #1 were reviewed. PR #1 adds an old unmerged file named `investor page`; it is not silently merged. Existing approved long page remains recoverable from Git. Its legacy downloads remain in Git but are excluded from the new static build pending content review.

## Google Drive work

Private team-root library: https://drive.google.com/drive/folders/1ORLPKQhXGC2qTNc8fok8PIhTnV2D-jpg . Six category folders were created beneath it. Permission readback shows named team members only; no anyone/domain permission was returned. Source indexes reference originals rather than moving, rewriting or duplicating their evidence.

Existing registration spreadsheet ID and Registrations schema read back successfully; the parent is the specified private User Data folder. Permission metadata returns named team members only. No new registration spreadsheet and no synthetic row were created through the connector. The user confirmed no Supabase migration needed.

## Verification

27 automated tests pass (12 financial/UI-contract, 6 Sheets-backend, 9 existing signup). All four source architecture examples reconcile to within one cent. Build succeeds; serves HTTP 200. Browser tested desktop 1280px, all five investor locales with no desktop horizontal overflow; Chinese mobile rendering checked in a 390×844 iframe viewport, not a physical phone. Original founder images loaded successfully. Browser manually tested primary CTA, monthly selection, keyboard increment, long-term scenario, advanced disclosure, and reset. Full screen-reader, physical-device and actual mainland-network testing remain unperformed. Investor materials controls scroll to the final section or open an email composer; they do not send messages automatically.

Backend has mocked persistence/security tests only. Apps Script source saved in owner-private staging project and verified exactly; no live Google authorization, deployed Edge adapter, end-to-end synthetic persistence, real contention test or real deletion test. Therefore Google Sheet integration is prepared, **not yet operational**. No hosted staging is claimed; local preview is available while the local server runs. External research/report URLs were source reviewed via connected Drive; broad public access remains a separate publication decision.

## Owner actions before cutover

1. Authorize and deploy the owner-executed Apps Script and stage the Edge proxy; configure its server-only secret. See REGISTRATION-INTEGRATION.md. The owner-private Apps Script staging project was created and the exact 5,181-character tested source saved and checked against the local bundle via editor readback. Project: https://script.google.com/home/projects/1-4rQ1RO88jiBfmNCraeyVv1oTZYSFnrkvvZQwUtWlNMfBZUtT2x7ImBG/edit . It has no secrets, authorization grant or web deployment yet; collection remains disabled.
2. Confirm controller/contact, retention and Google processing/disclosure in the privacy notice; approve a new notice version. Current public notice describes Supabase storage, so it must not be reused unchanged for Sheets.
3. Run one synthetic end-to-end staging registration, duplicate submission and deletion; read back exact destination; verify denied origin and non-public records. Gate cutover on success.
4. Review candidate, reconcile displayed contact address, confirm current funding status, and choose a company-owned domain/hosting account. No company-domain ownership or EdgeOne account was accessed. Mainland test requires independent real mainland networks.
5. Promote reviewed frontend only after all required acceptance checks; promote backend separately. Revert reviewed frontend commit for rollback; restore previous Edge function/version independently. Do not silently alternate stores after collection begins.

See DEPLOYMENT-ASSESSMENT.md for dated official EdgeOne sources, regional default-domain restrictions, ICP conditions, staging and rollback runbook. See RESEARCH-SOURCES.md for public/private publication decisions.
