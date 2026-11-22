---
name: wrap-up
description: Save and push this computer's work to GitHub so the owner's other computer can catch up. Use when the owner types /wrap-up or says they're done for now, leaving this computer, or switching to the laptop or desktop.
---

# Wrap up this computer

The owner works on two computers (a desktop and a laptop) that share work only through GitHub. Get everything from this one safely onto GitHub's `staging` branch, then report in plain, non-technical language. This never touches `main` (the live site): merging to live happens only when the owner says so.

1. **See what's here.** Run `git status` and `git fetch`. Note the current branch.
   - Not on `staging`: tell the owner which branch it is and ask before doing anything else.
   - Nothing changed and nothing unpushed: say "Nothing new to save — GitHub already has everything from this computer," and stop.
2. **Look before saving.** List the changed and new files in plain words. **Never commit secrets:** leave out `.env`, `.dev.vars`, `.claude/settings.local.json`, and any file holding keys or passwords. If one shows up as a change, skip it and mention it. If anything looks unexpected (files the owner and Claude didn't work on), ask before including it.
3. **Check GitHub hasn't moved on.** If `origin/staging` has commits this computer doesn't (`git log HEAD..origin/staging`), the other computer or another Claude session pushed meanwhile. Pull first with `git pull --ff-only` when the working tree allows it; if it can't fast-forward, stop and explain rather than merging, rebasing or forcing.
4. **Build before pushing:** `npm run build`. A failed build shows up later as a missing Cloudflare deploy, so if it fails, stop and explain; don't push broken code.
5. **Commit.** Stage the files by name (not `git add -A` blindly). Write the message to a temp file and use `git commit -F <file>` (PowerShell here-strings can fail). A short conventional message describing the work, ending with the commit attribution lines from the session's instructions. Check `git log -1` afterwards.
6. **Push:** `git push origin staging`. Never force-push. Then confirm `git log -1 origin/staging` matches the local commit.
7. **Report** in a few short lines:
   - what was saved (one plain sentence) and the commit's short hash
   - that it's on GitHub's staging branch, and the staging site will rebuild in a few minutes
   - anything left out on purpose (key files, unexpected files)
   - next step: on the other computer, open this project in Claude Code and type `/catch-up`
