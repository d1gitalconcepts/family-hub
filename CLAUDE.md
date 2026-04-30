# Family Hub — Claude Instructions

## Git workflow

- **Always commit to `main` directly.** Claude Code runs in a worktree (`.../.claude/worktrees/...`) — make edits there, but commit using the main repo at `C:/Users/colli/OneDrive/Documentos/GitHub/family-hub`. If a commit accidentally lands on the worktree branch, recover with `git rebase claude/<worktree-name>` from the main repo.
- **Commit after every logical unit of work** — do not batch commits at the end of a session.
- **Write proper commit messages**: imperative subject line (50 chars), blank line, then a short body explaining *why* if it's not obvious.
- **Never run `git push`** — the user always pushes manually. Do not push under any circumstances.
- **Never just print a commit message** and ask the user to run it — actually execute `git add <files>` and `git commit`.

## Worker deploys

After any change to `worker/src/` files, always remind the user to deploy the Cloudflare Worker. The deploy does not happen automatically — changes won't take effect until a manual deploy is run.

## Response format

After completing a step:
1. Brief plain-English summary of what changed and why
2. A clear signal that the step is done

Keep responses concise. The user can read diffs — no need to re-describe every line changed.

## Project context

- **Repo layout:** `hub/` (React frontend), `worker/` (Cloudflare Worker), `scraper/` (Linux Mint server, Playwright + pm2), `supabase/` (schema)
- **Scraper:** runs on a Linux Mint server as a cron job + pm2 watcher (`family-hub-watcher`). After changes to `scraper/`, the user needs to `git pull` on that machine and restart pm2 if the watcher changed.
- **User workflow:** Claude writes all code and commits. User reviews and pushes manually. User does not stage files or write commit messages.
