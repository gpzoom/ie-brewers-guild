import { ExternalLink, LegalEmail, LegalList, LegalPage, LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/site/legal";

const link = "text-primary underline underline-offset-2";

/**
 * The Terms of Use (spec docs/superpowers/specs/2026-11-17-terms-and-privacy-design.md).
 * Member content reuse follows owner decision B: the website plus Guild
 * social media, newsletters and event promotion, credited, with an opt-out.
 */
export function TermsOfUse() {
  return (
    <LegalPage
      title="Terms of Use"
      intro={
        <>
          <p>
            These terms are an agreement between you and the {LEGAL.name} ("the Guild", "we"),{" "}
            {LEGAL.entity}. They cover your use of {LEGAL.website}, including the member directory,
            events, jobs board, Member Portal and the Join page.
          </p>
          <p>
            By using the site, you agree to these terms. Members also agree to them when they submit an
            application or publish their profile. Please read them together with our{" "}
            <a href="/privacy" className={link}>
              Privacy Policy
            </a>
            .
          </p>
        </>
      }
    >
      <LegalSection title="21 and over">
        <p>
          This site features producers of beer, wine, cider, mead and spirits. You must be of legal
          drinking age (21 or older) to use it, and we ask you to confirm your age before you enter.
          Please drink responsibly, and never drink and drive.
        </p>
      </LegalSection>

      <LegalSection title="Using the site">
        <p>Please use the site lawfully and respectfully. Don't:</p>
        <LegalList
          items={[
            "try to get into another person's account or a part of the site you aren't allowed to use;",
            "disrupt the site, overload it, or get around its security or limits;",
            "copy member contact details in bulk, or use them to send spam;",
            "pretend to be someone else, or apply to join on behalf of a business you don't represent.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Accounts and sign-in links">
        <p>
          Members sign in with one-time links sent by email, so anyone who can read your email can sign
          in as you. Keep your email account secure. A profile's owner decides who else can edit it, and
          is responsible for the people they invite. To help members, Guild administrators can view and
          edit a profile on the member's behalf.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          <strong>You keep ownership</strong> of everything you add to your profile: your logo, photos,
          descriptions, events, discounts and job postings ("your content").
        </p>
        <p>
          You give the Guild permission, free of charge, to store, display, resize and format your
          content on the website, and to feature it on the Guild's social media, in its newsletters and
          emails, and in event promotion, always with credit to your business. This permission lasts
          while your profile is on the site. Things already shared before your profile was removed, such
          as a past newsletter, may stay where they are.
        </p>
        <p>
          You can opt out of uses beyond the website at any time by emailing <LegalEmail />. We'll stop
          new uses, and remove existing posts where we reasonably can.
        </p>
        <p>
          Photos sent to you through a sharing link are shown only on your profile, because that is the
          permission their photographer gives. We don't reuse them beyond the website.
        </p>
        <p>
          You promise that you have the right to share your content and that it doesn't break anyone
          else's rights.
        </p>
      </LegalSection>

      <LegalSection title="Keeping it accurate and lawful">
        <p>
          You are responsible for keeping your hours, events, discounts and job postings accurate and up
          to date. Your content must not be false or misleading, must not infringe anyone's rights, and
          must follow the law, including the rules on advertising alcohol and not appealing to people
          under 21. Beer-related content must also follow the Brewers Association Advertising and
          Marketing Code.
        </p>
        <p>
          The Guild monitors member content, including photos, events and job postings, for these rules
          after it's posted.
          We may edit, hide, unpublish or remove content that breaks these terms, or that we reasonably
          believe could harm the Guild, its members or the public.
        </p>
      </LegalSection>

      <LegalSection title="Joining the Guild">
        <p>
          Applying through the Join page doesn't make you a member. The Guild reviews each application
          and decides who is accepted. Membership, dues and voting are governed by the Guild's own rules,
          not by these terms.
        </p>
      </LegalSection>

      <LegalSection title="Inland Scan Pass">
        <p>
          The Inland Scan Pass is free and is for people 21 or older. You can use it at any Guild member that
          takes Scan Pass check-ins, to earn that member's loyalty rewards.
        </p>
        <p>
          The Beer Trail Pass is sold through Zeffy for one trail year (January 1 to December 31, Pacific
          time). With a pass, you can use the Beer Trail offer, set by the Guild, once at each Beer Trail stop
          that year. Only the Scan Pass holder can use it. Guild rewards are for visiting different stops, not
          for how much you drink. Stops you visited earlier that year count once you have a pass. A pass
          doesn't renew by itself; each year's trail is a new pass. Passes are non-refundable. If the Guild
          refunds one anyway, that pass's Beer Trail benefits end.
        </p>
        <p>
          Guild members may also offer loyalty rewards for coming back. Each one is set by the member and
          approved by the Guild, and the member honors it. A reward you earn waits on your Scan Pass until you use
          it, and it expires after the time the member shows. One reward per visit. Rewards have no cash
          value and can't be transferred. A check-in counts only when a staff member confirms it, with the
          staff QR code or the staff code.
        </p>
        <p>
          A stop may refuse service as the law requires. The Guild can change or end the program, its
          rewards, its passes and its stops at any time.
        </p>
      </LegalSection>

      <LegalSection title="Jobs board">
        <p>
          Job postings come from members. The Guild isn't the employer and isn't part of hiring: job
          seekers apply to, and deal directly with, the member who posted the job. Members who post jobs
          are responsible for following employment laws.
        </p>
      </LegalSection>

      <LegalSection title="Information on the site">
        <p>
          Hours, events, discounts and other details come from our members and can change. Please check
          with the business before you go. The site and everything on it are provided "as is", without
          promises of any kind, including that it will always be available, accurate or error-free.
        </p>
      </LegalSection>

      <LegalSection title="Other websites and Google Maps">
        <p>
          Links to members' websites and social pages are there for your convenience; we aren't
          responsible for those sites. Our maps and business lookups use Google Maps, so using them also
          means agreeing to the{" "}
          <ExternalLink href="https://maps.google.com/help/terms_maps/">
            Google Maps Terms of Service
          </ExternalLink>{" "}
          and the <ExternalLink href="https://policies.google.com/privacy">Google Privacy Policy</ExternalLink>.
        </p>
      </LegalSection>

      <LegalSection title="The Guild's name and logo">
        <p>
          The Guild's name, logo and the design of this site belong to the Guild. Please don't use them in
          a way that suggests the Guild endorses something without our permission.
        </p>
      </LegalSection>

      <LegalSection title="Limits on our liability">
        <p>
          To the fullest extent the law allows, the Guild, its officers and volunteers are not liable for
          any indirect, incidental or consequential losses arising from your use of the site, and our
          total liability to you for any claim is limited to $100.
        </p>
      </LegalSection>

      <LegalSection title="Members' responsibility">
        <p>
          If someone makes a claim against the Guild because of a member's content, or because a member
          broke these terms, that member agrees to cover the Guild's reasonable costs, including legal
          fees.
        </p>
      </LegalSection>

      <LegalSection title="Ending access">
        <p>
          We may suspend or remove an account or profile that breaks these terms. You can ask us to
          remove your profile at any time by emailing <LegalEmail />.
        </p>
      </LegalSection>

      <LegalSection title="Law and disputes">
        <p>
          These terms are governed by the laws of the State of California. Any dispute will be handled in
          the state or federal courts located in {LEGAL.county}, California.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          If we change these terms, we'll post the new version here with a new effective date. If a
          change is significant, we'll also email our members. Using the site after a change means you
          accept the new terms.
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
