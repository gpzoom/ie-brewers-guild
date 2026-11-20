# Beer Trail launch day checklist

Inland Tap Card: universal loyalty card + Beer Trail Pass through Zeffy. Everything below is on staging today.
**Claude** = done in the code/terminal session. **Owner** = done by you in a browser.

## Before launch day

- [ ] **Owner:** final look at staging: the Tap Card pages, /privacy, /terms and the Member Guide PDFs.
- [ ] **Owner:** in Zeffy, set the live campaign's **real price**. It was $0 for testing.
- [ ] **Owner:** in Zeffy, create a **100% discount code** for one test purchase on the live campaign (so the live test costs nothing).
- [ ] **Owner:** decide which producers are Beer Trail stops (**Guild → Members → Add to Tap Card trail**).

## Launch day, in this order

1. [ ] **Owner:** say **"go"**.
2. [ ] **Claude:** check staging and main are in step, run all tests and the build.
3. [ ] **Claude:** set the Privacy Policy and Terms **effective date** to today.
4. [ ] **Claude:** merge staging into the live site and push. Confirm the live site is updated by checking pages, not just the deploy time:
   - `iscbrewersguild.org/trail/join` opens.
   - **Then** copy both Zeffy keys (`ZEFFY_API_KEY`, `ZEFFY_WEBHOOK_SECRET`) to the live site without displaying them (only possible once the merged version is the one running: staging pushes leave undeployed preview copies on the live Worker, and Cloudflare refuses secret edits while one is newest). Confirm `SITE_ORIGIN` survived and `iscbrewersguild.org/api/zeffy/webhook` answers a test message.
5. [ ] **Owner:** in Zeffy → **Settings → Integrations → Webhooks**, change the URL to
   `https://iscbrewersguild.org/api/zeffy/webhook`
   (keep **Send notifications** on, and **payment.completed / updated / deleted** checked). Save.
6. [ ] **Owner:** send Claude the **live campaign's link**.
7. [ ] **Claude:** switch the 2027 entry on **Guild → Tap Card → Passes** to the live campaign (ID + form link, commission 50%), and confirm the **testing switch is off**.
8. [ ] **Owner:** **publish** the live Zeffy campaign. Its thank-you redirect is already set to `https://iscbrewersguild.org/trail/joined`.

## Live test (right after launch)

9. [ ] **Owner:** at a published Beer Trail stop's counter plate (Sample Brewery only works on staging), in a private tab with an email that has no card:
   tap **Join the Beer Trail** → pay with the 100% discount code → you land back signed in → check in.
10. [ ] **Owner:** **Guild → Tap Card → Passes** shows the pass credited to that stop.
11. [ ] **Claude:** delete the live test card, pass and sign-up (shown to you first), and you delete or disable the discount code in Zeffy.

## Tell people

12. [ ] **Owner + Claude:** the members' notice of the Privacy Policy and Terms changes (Zeffy payments, free card, member email opt-ins). Claude drafts; nothing is sent without your go.
13. [ ] **Owner:** tell members how to start: open **Tap Card** in the menu, set a staff code, print the **counter plate** and the **staff QR code**. The Member Guide pages "The Inland Tap Card" and "Rewards, passes and bar devices" walk them through it.

## Afterward

- [ ] **Claude:** lessons-learned review at the merge.
- [ ] Watch the first real sales on **Guild → Tap Card → Passes**.
- [ ] **Before selling the 2028 pass:** add a "sale opens" date so two years can be on sale at once (deferred list at the end of `docs/superpowers/plans/2026-11-19-universal-tap-card.md`).
