---
name: catch-up
description: Bring this computer up to date with the latest work from the owner's other computer (desktop/laptop synced through GitHub). Use when the owner types /catch-up or says they're switching computers, starting on the laptop or desktop, or want to make sure this machine is current.
---

# Catch up this computer

The owner works on two computers (a desktop and a laptop) that share work only through GitHub. Bring this one up to date safely, then report in plain, non-technical language.

1. **Check for unsaved local work first.** Run `git status` and compare the local branch with GitHub (`git fetch`, then `git log origin/<branch>..HEAD` and `git log HEAD..origin/<branch>`).
   - Uncommitted changes, or local commits that aren't on GitHub: **stop and tell the owner** what they are, in plain words. Don't discard, stash, reset or overwrite anything without their go-ahead.
2. **Get onto staging and pull.** If the current branch isn't `staging`, say so and switch only if the working tree is clean. Then `git pull --ff-only origin staging`. If the pull can't fast-forward, stop and explain rather than merging or rebasing on your own.
3. **Install packages:** `npm install`.
4. **Check the key files.** `.env` and `.dev.vars` don't sync through GitHub. Confirm both exist and have the keys the build needs (compare the names with the ones the code reads, for example `VITE_SUPABASE_URL`, `VITE_GOOGLE_MAPS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). **Never print key values.** If one is missing, name it and tell the owner to copy the file over from the other computer.
5. **Build:** `npm run build`. If it fails, show the important part of the error and explain it.
6. **Report** in a few short lines:
   - the latest commit (short hash and message), and that it matches GitHub
   - what came in since this computer was last updated (a one-line summary of the new commits, if any)
   - whether the key files and build are OK
   - anything the owner needs to do

Reminder to include at the end: before leaving this computer, ask Claude to commit and push your work, so the other computer can catch up.
