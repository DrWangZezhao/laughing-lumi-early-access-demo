# Authorized administration

There is no public admin website. After Supabase setup, use an authorized project member account with MFA in the Supabase dashboard.

1. **View:** Project → Table Editor → `public.early_adopters`. Filter by status and purpose as needed. Never weaken RLS or grant public table access for convenience.
2. **Export:** In Table Editor use the export/CSV action for the intended rows, or run an authorized SELECT in SQL Editor and use its results export. Check the exported scope before sharing. Keep exports in a restricted location, never this public repository or a public/shared-by-link Drive folder. Delete exports when their purpose ends.
3. **Withdraw/delete:** Handle the request through the confirmed privacy contact. Verify the requester proportionately; find the normalized email, then delete the intended row(s) in Table Editor. If a justified policy calls for retaining a status record, mark it withdrawn and ensure the communications process excludes it. A retained withdrawn row still contains personal data: follow the confirmed retention policy and do not invent an indefinite suppression list.
4. Delete synthetic test records promptly. Account for provider backup expiry in the notice and deletion procedure.
5. Review retention on the agreed schedule. Restrict dashboard membership to people who need access; the server key bypasses RLS and must stay private. Do not log request bodies or database error details.

Before real launch, verify that anonymous and ordinary authenticated API callers cannot SELECT/INSERT/UPDATE/DELETE the table, cannot access `signup_budget`, and cannot execute the registration RPC. Only the Edge Function's server role can call it. Public signup responses never include record IDs or emails.
