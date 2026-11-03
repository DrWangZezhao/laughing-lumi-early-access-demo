# Lumi hosting assessment

Research date: 2026-11-03. Documentation assessment only; no cloud project, DNS, production deployment, account registration or live signup was changed. No actual mainland China network test has been performed. Availability and signup success from mainland China remain unverified.

## Recommended sequence

Keep the existing GitHub Pages site and EU signup service working while reviewing a separate EdgeOne staging project. Register the company's international Tencent Cloud account first using the company's real legal identity and account country; an international account is not a substitute for Chinese mainland identity checks or ICP eligibility. Select **Global excluding Chinese mainland** for the first international preview. Decide the China operating entity, domain, hosting region and data handling independently before creating a China production service. Do not promise that European company incorporation alone qualifies for mainland hosting. Tencent offers a foreign-enterprise China compliance service covering domains, ICP/PSB and licensing; confirm the actual entity and business model with that service before procurement. [Tencent China compliance](https://intl.cloud.tencent.com/zh/solutions/information-compliance-in-china?lang=zh).

A single GitHub repository can remain the source for GitHub Pages and an EdgeOne project; no repository move is needed. EdgeOne supports GitHub authorization and builds when its selected deployment branch receives a push. Start with a dedicated staging branch to avoid coupling every current production push to a new service. Use Node 22, build command `npm test && npm run build`, output directory `dist`, repository root `/`, and the plain/static framework option. [Official Git import guide](https://pages.edgeone.ai/document/importing-a-git-repository).

## What the actual repository needs

`package.json` has no runtime/npm dependencies. HTML, CSS, scripts and mascot PNGs are served locally. `scripts/build.js` copies only public website directories to `dist`; the existing Pages workflow already tests and deploys that directory. Preserve that public-file boundary: never publish `supabase/`, signup exports, `.env` or administrator files.

The homepage's real signup still calls `https://vgeseoyoztogthygvzog.supabase.co/functions/v1/signup`; changing frontend hosting does not relocate the EU/Ireland database. Its handler requires the exact request origin in the server-side `ALLOWED_ORIGINS` secret, so a new staging origin will return 403 until separately allowlisted. Keep existing origins when adding one; never replace the complete allowlist accidentally. Do not run real registration tests without an approved synthetic test and cleanup procedure.

The survey opens Google Apps Script; team links open LinkedIn, and the company link points to `https://www.laughinglumi.com`. These are external destinations rather than required homepage rendering assets. Supabase and Google dependencies still need mainland testing even if the static frontend moves. Local assets reduce requests but do not prove China connectivity. A separate China frontend must not silently reuse the EU collection endpoint without a documented data-flow and privacy decision.

## Region, domain and China constraints

EdgeOne's documentation distinguishes mainland, global including mainland, and global excluding mainland regions. The first two require an ICP-filed custom domain; the last does not require ICP for its custom domain. [Domain overview](https://pages.edgeone.ai/document/domain-overview). EdgeOne also requires identity verification for mainland/global acceleration. [Official quick start](https://edgeone.ai/document/54208).

There is a material preview limitation: the current official error guide says default project/deployment domains in the excluding-mainland region return 401 to mainland clients. Including-mainland/mainland preview links expire after three hours. The domain overview describes preview access somewhat differently, so use the stricter error-guide rule and confirm behavior in the console. A default EdgeOne URL is therefore unsuitable as a permanent China launch address. [Official 401/access rules](https://pages.edgeone.ai/document/error-codes).

A custom domain is associated with an environment and follows that environment's latest successful deployment; adding one requires domain ownership verification and DNS resolution changes. [Custom-domain guide](https://pages.edgeone.ai/document/custom-domain). Under the present **no DNS change** constraint, use only staging URLs and keep the company domain pointed at its current service. Actual company-domain cutover cannot be completed without a later authorized DNS change.

## Reviewable staging and release procedure

Commands below are a runbook, not commands executed for this assessment. Substitute reviewed commit IDs, branch names and returned URLs; do not place tokens in the repository.

```sh
# Local verification; does not deploy
npm test
npm run build
python3 -m http.server 8765 --directory dist

# Record immutable candidates before any later release
RELEASE_SHA=$(git rev-parse HEAD)
git show --stat "$RELEASE_SHA"
git switch -c edgeone-staging
# Push only after the intended staging commit is reviewed
git push -u origin edgeone-staging
```

In the EdgeOne console, import this repository, select `edgeone-staging`, apply the build settings above and use the excluding-mainland region. Review its generated URL, HTTPS, mobile layout, all five languages, calculator inputs/outputs, exports, privacy and survey links. Record the deployed SHA and deployment identifier. Keep signup disabled on staging or separately approve its exact origin and a synthetic signup test; a successful static build does not verify signup.

For an independently created **direct-upload** project, the official CLI alternative below supports explicit preview/production targets. Do not point this command at the Git-connected project: the CLI documents existing-project linkage for direct-upload projects only. Authenticate interactively under the company's approved account; use the console's region setting and explicit global site selection. [Official CLI](https://pages.edgeone.ai/document/edgeone-cli).

```sh
# Optional alternative only; requires CLI installation and account authorization
edgeone login --site global
edgeone makers deploy ./dist -n lumi-international-staging -e preview --site global
# Later production promotion by rebuilding the exact reviewed commit
edgeone makers deploy ./dist -n lumi-international-staging -e production --site global
```

No DNS cutover is performed in this phase. To promote through the existing GitHub Pages workflow later, merge the reviewed change to `main` and verify the resulting Actions run and public page. For a Git-connected EdgeOne production project, select the approved production branch and let that reviewed commit build there. Before an eventual company-domain migration, export the current DNS record values/TTL, validate the new certificate, preserve the old host, and agree the rollback owner. The domain guide's prescribed DNS changes must be executed separately; do not guess provider-specific commands.

```sh
# Git-based rollback: substitute the single bad release commit; review before push
git switch main
git pull --ff-only
git revert <bad-release-commit-sha>
npm test
npm run build
git push origin main
```

This triggers the repository's current GitHub Pages deployment and any Git integration configured for `main`. Confirm each deployment completed. Frontend rollback does not undo database migrations or server secrets. A later DNS rollback restores the exact saved prior records and waits for resolver caches; it cannot be promised instantaneous. Do not delete either hosting project during staging or rollback.
