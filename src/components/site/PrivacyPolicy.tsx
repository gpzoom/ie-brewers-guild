import { ExternalLink, LegalEmail, LegalList, LegalPage, LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/site/legal";

/**
 * The Privacy Policy (spec docs/superpowers/specs/2026-11-17-terms-and-privacy-design.md).
 * It describes what the site actually does: keep it in step when a feature
 * starts collecting something new, and move the effective date in LEGAL.
 */
export function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <>
          <p>
            The {LEGAL.name} ("the Guild", "we") is {LEGAL.entity} for independent craft alcohol
            producers and the businesses that support them. This policy explains what information we
            collect on {LEGAL.website}, how we use it, and the choices you have.
          </p>
          <p>
            Questions? Email us at <LegalEmail />.
          </p>
        </>
      }
    >
      <LegalSection title="What we collect">
        <p>We only collect what we need to run the Guild's website and member directory.</p>
        <LegalList
          items={[
            <>
              <strong>When you contact us</strong> (the Contact page, the sign-in help form or the Help
              button): your name, email address, phone number if you give it, and your message. With a
              sign-in help request or a Help button message we also note your browser type, and for the
              Help button which page you were on, to help us fix the problem.
            </>,
            <>
              <strong>When you apply to join:</strong> your email address, business name, city and
              member type, and the business details from the Google listing you pick (address, phone,
              hours, website and a short description).
            </>,
            <>
              <strong>Members and the people who edit a profile:</strong> your sign-in email address;
              everything you add to your profile, such as your business details, hours, links, events,
              discounts and job postings; marketplace listings, including the contact name, email address and
              phone number you put on them; your logo and photos; any calendar link you connect (we only
              bring in the events you tag for the Guild); and a record of who changed what and when.
            </>,
            <>
              <strong>Photos sent through a member's sharing link:</strong> the photos and the name you
              give for credit.
            </>,
            <>
              <strong>Email:</strong> members' email addresses for Guild emails, and whether you have
              unsubscribed.
            </>,
            <>
              <strong>Automatically:</strong> your IP address and browser information, which we use to
              keep the site secure and to limit repeated attempts (for example, too many sign-in
              requests). Our hosting provider keeps standard, short-lived server logs.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Our own cookies are only the ones the site needs. Sign-in cookies keep you signed in. When
          you confirm you're 21 or older, we save a cookie so we don't ask again for one year; it records
          only that you confirmed you're 21 or older. The Help
          button may remember your first name on your own device so you don't have to type it again. We
          don't add advertising, analytics or tracking tools to the site.
        </p>
        <p>
          Some pages load things from other services: maps from Google Maps, the site's fonts from Google
          Fonts, and help videos from Livid. Those services receive your IP address and browser
          information when they load, and may set their own cookies under their own privacy policies.
        </p>
      </LegalSection>

      <LegalSection title="How we use it">
        <LegalList
          items={[
            "To run the member directory, events, jobs board and maps.",
            "To review applications to join and to set up and support member profiles.",
            "To answer your messages and help with sign-in problems.",
            "To send sign-in links, notices about your profile, and Guild emails to members.",
            "To keep the site secure and prevent abuse.",
          ]}
        />
      </LegalSection>

      <LegalSection title="What's public">
        <p>
          A member's published profile is public: business name, address, phone, hours, links,
          description, logo, photos, events and job postings. Nothing is public until the profile is
          published. Sign-in email addresses are never shown publicly, unless you also list one as your
          business's contact email.
        </p>
        <p>
          Marketplace listings aren't public. Only people who manage a published Producer profile, and Guild
          admins, can see them.
        </p>
      </LegalSection>

      <LegalSection title="Who we share it with">
        <p>
          <strong>We don't sell your information</strong>, and we don't share it for advertising. We
          share it only with the services that run the site, and only so they can do that work:
        </p>
        <LegalList
          items={[
            <><strong>Cloudflare</strong> hosts the website, protects it from attacks, and routes our email.</>,
            <><strong>Supabase</strong> stores our database and uploaded photos.</>,
            <><strong>Resend</strong> sends the site's emails.</>,
            <><strong>Google Fonts</strong> supplies the site's fonts.</>,
            <><strong>Livid</strong> hosts the help videos in the Member Portal.</>,
            <>
              <strong>Google Maps</strong> shows maps and looks up business details. When a map loads,
              Google receives your IP address and browser information. Google's use is covered by the{" "}
              <ExternalLink href="https://policies.google.com/privacy">Google Privacy Policy</ExternalLink>{" "}
              and the{" "}
              <ExternalLink href="https://maps.google.com/help/terms_maps/">
                Google Maps Terms of Service
              </ExternalLink>
              .
            </>,
          ]}
        />
        <p>
          We may also share information if the law requires it, or to protect the Guild, its members or
          the public.
        </p>
      </LegalSection>

      <LegalSection title="Your email choices">
        <p>
          We email only our members and people who ask to hear from us. We never add you to an email list
          without your OK. For example, writing to us through the Contact page doesn't sign you up for
          anything.
        </p>
        <p>
          Every Guild email sent to a list includes an unsubscribe link. Emails you need to use the site,
          such as sign-in links and notices about your own profile, still go out.
        </p>
      </LegalSection>

      <LegalSection title="See, correct or delete your information">
        <p>
          Members can change their profile at any time in the Member Portal. For anything else, such as a
          copy of what we hold about you, a correction, or deleting your information or profile, email{" "}
          <LegalEmail />. We'll answer within 30 days. We may keep some records when we need them for
          legal, security or accounting reasons, such as the record of changes made to a profile.
        </p>
      </LegalSection>

      <LegalSection title="Do Not Track">
        <p>
          Some browsers send a "Do Not Track" signal. We don't track visitors across other websites, and
          we don't allow advertisers to, so there is no tracking for the signal to turn off. The site works
          the same either way.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          We keep member information while you are a member and for a reasonable time afterward. Messages
          and applications are kept as long as we need them to respond and to keep a record of our
          decisions. Server logs are kept only briefly.
        </p>
      </LegalSection>

      <LegalSection title="Under 21">
        <p>
          This site is for adults of legal drinking age (21 and over). We ask you to confirm you're 21
          or older before you enter, and anyone who says they're under 21 can't go further, so we don't collect
          their information. We don't knowingly collect information from anyone under 21. If you think
          someone under 21 has given us information, email <LegalEmail /> and we'll delete it.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          We sign people in with one-time email links instead of passwords, use secure connections, and
          limit who can see member information. No system is perfectly secure, but we work to protect
          your information.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          If we change this policy, we'll post the new version here with a new effective date. If a
          change is significant, we'll also email our members. See also our{" "}
          <a href="/terms" className="text-primary underline underline-offset-2">
            Terms of Use
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Contact us">
        <p>
          {LEGAL.name}: <LegalEmail />
        </p>
      </LegalSection>
    </LegalPage>
  );
}
