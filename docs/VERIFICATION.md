# Verification record — 8 October 2026

Real collection is enabled through the Supabase Edge Function. A synthetic live request returned `200 {"stored":true}` and the synthetic row was removed immediately after verification.

## Completed locally

- Core suite: 8 passing Node tests covering five languages/two roles, strict consent/types, stale notice, honeypot/time checks, 4 KiB body limits, origin/method restrictions, server activation gates, mocked database failure/confirmation, trusted redirect URLs and safe published flags.
- Migration executed in ephemeral PGlite PostgreSQL: schema creation; 12 denied privilege checks (SELECT/INSERT/UPDATE/DELETE registration, SELECT quota, execute RPC for each of anon/authenticated); service-role insert; active-email uniqueness; duplicate handling; re-registration after withdrawal; global rate quota. Synthetic rows deleted and instance closed. This is not a live Supabase integration test.
- Browser layout matrix: 1440×900, 768×1024, 375×812, 390×844, 844×390 and 320×812 across EN/FI/ZH/SV/ES. One mascot and no document horizontal overflow in 30 combinations. Initial narrow/tablet text and speech boundary findings prompted responsive fixes.
- Original logo and five poses extracted without recompression. Existing scene, letter, star and drag animations retained.
- Eye-covering pose observed during browser email entry. Email, consent and submit controls are interactive; roles remain interactive. Chinese parent and teacher invitations verified as distinct in the rendered form.

## Limits / before collecting data

Actual Supabase migration, Edge Function deployment, live storage/duplicate/cleanup tests and public API privilege checks still require the provisioned project. Mock responses and local PostgreSQL do not establish a live integration. Final privacy details must also be confirmed.

No real iPhone/Android or Safari-device testing was performed. Viewport resizing is not a device or keyboard test. Future redirect is disabled: destination validation is unit tested, and real end-to-end redirection must be checked after a backend and product demo are ready.
