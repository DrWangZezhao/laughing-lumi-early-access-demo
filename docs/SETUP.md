# Deployment and activation

## Public website

Repository Settings → Pages → Build and deployment → Source: **GitHub Actions**. The `pages.yml` workflow runs on approved pushes to `main`, tests code, copies an explicit allowlist into `dist`, and deploys that artifact. No custom domain. No backend secrets are needed by this workflow.

## Later: create the secure database

The owner created a Supabase account on 8 October 2026; project setup and live verification are pending. Do not replace the registration database with a public Google Drive sheet. Until the following setup is complete, keep email entry and submission disabled.

1. Sign up/sign in to Supabase; create a Free-plan project in an available EU region. Verify the region, provider contracts and any transfer safeguards with the controller. Store its database password in a password manager.
2. Create GitHub environment `supabase-production`. Restrict deployment to `main` and configure a required reviewer where available. Add environment secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`. Never put these in files or chat. Limit administrator access and use MFA.
3. Run the manual `Deploy Supabase (manual)` workflow. It applies the migration then deploys `signup`. Alternatively run the same `supabase link`, `supabase db push` and `supabase functions deploy signup` commands with the CLI authenticated locally. The function deliberately accepts public visitors (`verify_jwt = false`); server-side validation, activation gates, quotas and database privileges provide its boundaries.
4. Supabase Edge Functions → Secrets: set `ALLOWED_ORIGINS=https://drwangzezhao.github.io`, `REAL_SIGNUP_ENABLED=false`, `PRIVACY_READY=false`, and the final `PRIVACY_NOTICE_VERSION`. Origin matching is exact and excludes the repository path. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the server automatically. Do not copy that privileged key into GitHub Pages. No public browser database key is needed.
5. Complete the privacy notice, all five language versions, withdrawal route, retention policy and controller/contact verification. Replace the draft page and choose a final, immutable notice version. Archive old notices as public documents when versions change; never silently alter what a saved version means.
6. In a controlled staging setup, verify the database/endpoint with synthetic `example.test` addresses, check RLS with anonymous and authenticated public keys, and delete synthetic rows afterwards. Test duplicate, invalid, unavailable and quota responses. **Do not claim production integration works before these checks.**
7. Only after approval, set server `PRIVACY_READY=true`, final notice version and `REAL_SIGNUP_ENABLED=true`. Update `js/config.js` with the exact HTTPS function endpoint (`https://PROJECT.supabase.co/functions/v1/signup`), matching final notice version, `PRIVACY_READY:true`, `REAL_SIGNUP_ENABLED:true`. Deploy and test. Both independent gates must be active. Turning the server flag off immediately closes submissions; frontend-only flags are not a security boundary.

## Spam and duplicate behavior

The handler rejects unexpected fields, invalid consent, invalid role/language/email, stale notice versions, a populated honeypot, very fast submissions, and bodies larger than 4 KiB. The database serializes a global budget of 10 valid attempts per minute / 300 per UTC day, including duplicates. It stores only aggregate counters, no IP or visitor identifier. Quotas may deny legitimate users during abuse; monitor aggregate service health and adjust deliberately. Origin allowlisting is a browser boundary, not authentication: non-browser bots can spoof it. Honeypot/time checks are only basic bot friction. Sophisticated abuse may require a reviewed additional challenge service; no such processor is silently added.

Active normalized email addresses are unique for waitlisted/invited records. Repeating signup gives the same generic storage confirmation without updating existing consent, role or preferences. This limits public email enumeration. Signing up is an expression of interest, not proof of mailbox ownership; do not treat it as authentication or a private-demo access grant.

## Future demo

Replace `demo/index.html`, or independently host the AI product. For the existing GitHub project site use `DEMO_REDIRECT_URL:'./demo/'` (root `/demo/` would incorrectly bypass the repository prefix). For an external destination configure its HTTPS URL and add its origin to `TRUSTED_DEMO_ORIGINS`. Query strings, fragments, credentials and untrusted origins are rejected. Set `DEMO_REDIRECT_ENABLED:true` only when ready. Confirmed database storage is required; disabled forms and failed submissions never redirect. No form data is appended to any URL. The demo must implement its own authentication if needed.

## Privacy launch checklist

Confirm legal controller identity/address; privacy contact; purpose and communication scope; consent/legal basis; a working withdrawal/deletion process; retention/review period and responsible person; processor/subprocessor contracts, logging and international transfers; user-rights and supervisory-authority information; final version/date and EN/FI/ZH/SV/ES notices. Do not infer these details from the GitHub owner's profile.

Application code records no IP/location/fingerprints/history or mouse movements. Providers may retain transport/security logs: inspect their current settings/contracts and disclose accurately. Do not enable personal data collection until the team resolves this distinction.

References: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase function configuration](https://supabase.com/docs/guides/functions/function-configuration), [European Commission individual rights](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en). These support the setup; the template is not a legal compliance certification.
