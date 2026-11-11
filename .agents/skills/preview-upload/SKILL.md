---
name: preview-upload
description: Put a saved HTML copy of a rig page on a public HTTPS link (Vercel), upload over that link without the lane marker once the review is in, and take it down. Use when a plan asks for a preview for review (ADR 0003).
---

# preview-upload

A reviewer reads a page from a copy on a public link, not from the lane (ADR 0003). This puts one saved
HTML file on a Vercel project's production link, uploads over that link, and takes it down. Each of those
changes a public host: ask the human first (what, why, where, who can see it, how to undo it), then wait
for their yes.

## Tool

The Vercel CLI, signed in to the human's account (`vercel whoami`). Uploads need CLI 47.2.2 or later. If
the installed one is older, ask the human, then run a current one through npx, which leaves the installed
one as it is: `npx --yes vercel@65.14.0`. Below, `vercel` means whichever one you run. Read
`vercel <command> --help` before you first use a command: the flags change between versions.

## Steps

1. Save the page with a command, into a folder outside the repo that holds only that file:

   ```sh
   PORT=8799 pnpm start &              # the banner shows LANE_MARKER from .env
   # wait until http://localhost:8799/health answers
   curl -fsS http://localhost:8799/digest/2026-10-28 -o <dir>/digest-2026-10-28.html
   lsof -ti tcp:8799 | xargs kill
   ```

   Without the marker, start it as `LANE_MARKER= PORT=8799 pnpm start`: a blank value in the environment
   wins over `.env`, and the banner reads "no marker set".

2. Check the file before it goes anywhere: a doctype, no `<script>`, every row you expect, no local paths
   or account names. Count the marker, never print it:

   ```sh
   grep -oF "$(sed -n 's/^LANE_MARKER=//p' .env)" <file> | wc -l    # 1 with the marker, 0 without
   ```

3. Up, the first time:

   ```sh
   vercel deploy <dir> --prod --yes --project <name> --create-if-missing
   ```

   The reply has the link: `productionUrl`, then the file's path. Take it from the reply, not from the name
   you asked for: a taken name gets a suffix (`<name>-<word>.vercel.app`). Keep the deployment `id` from
   the reply for step 5.

4. Check it the way a stranger opens it: plain `curl` with no sign-in gives 200 and the same bytes as the
   file (`cmp`). The deployment's own URL and the `<name>-<team>.vercel.app` alias sit behind Vercel's
   sign-in (302): never send those. Don't check with `vercel curl` or `deploy --verify`: they get past the
   sign-in, so they can't show the link is public.

5. Upload over the same link, once the review is in:

   ```sh
   vercel deploy <dir> --prod --yes --project <name>
   vercel remove <old deployment id> --safe --yes
   ```

   No `--create-if-missing` here: a wrong name should fail, not make a new project. The link moves to the
   new deployment. The old one stays at its own URL, behind the sign-in, marker and all, until you remove
   it; `--safe` skips it while it still holds the link. Check: the link gives the new file (`cmp`, marker
   count 0), and the old deployment's URL gives 404.

6. Down, when the human wants the page gone:

   ```sh
   vercel project delete <name> --confirm-name <name> --scope <team>
   ```

   That deletes every deployment and alias with it. Check: the link gives 404, and `vercel project ls` no
   longer lists the project.

## Don'ts

- Don't put a preview in the repo, an issue, a pull request or a chat attachment (ADR 0003). A page pushed
  to a repo stays in its history after you delete it, so GitHub Pages is out too.
- Don't take the marker off before the review is in (ADR 0003).
- Don't print `.env`, the marker or a token: count the marker instead.
- Don't approve a delete for the human. `project delete` takes `--confirm-name` once they've said yes;
  agents can't use `--yes` there.
