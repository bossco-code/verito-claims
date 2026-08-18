import { LegalLayout } from "@/components/verito/LegalLayout";

export default function Terms() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Terms of Service"
      updated="August 13, 2026"
      intro="These Terms of Service (“Terms”) govern your access to and use of Verito, the AI operations assistant for Amazon FBA sellers, available at verito.online (together with the Verito web application, dashboards, and related software, the “Service”). The Service is operated by VTPlatform (“Verito,” “we,” “us,” or “our”). By creating an account, connecting a marketplace account, or otherwise using the Service, you agree to be bound by these Terms and by our Privacy Policy."
      sections={[
        {
          heading: "Agreement to these Terms",
          paragraphs: [
            <>
              By creating an account, connecting an Amazon Seller Central
              account, or otherwise accessing or using the Service, you agree
              to these Terms and to our{" "}
              <strong>Privacy Policy</strong>, which is incorporated into these
              Terms by reference. If you do not agree, do not use the Service.
            </>,
            <>
              If you use the Service on behalf of a company, partnership, or
              other entity, you represent and warrant that you have the
              authority to bind that entity to these Terms, and “you” in these
              Terms refers to both you individually and that entity.
            </>,
          ],
        },
        {
          heading: "The Service",
          paragraphs: [
            <>
              Verito connects to your Amazon Seller Central account with
              read-only authorization, analyzes your selling data for
              discrepancies and reimbursement opportunities, organizes the
              supporting evidence, and prepares marketplace-ready claim
              packages for your review.
            </>,
            <>
              <strong>Verito does not file, submit, or escalate claims.</strong>{" "}
              Verito does not communicate with Amazon on your behalf and never
              lists, prices, or otherwise modifies your catalog. You remain
              solely responsible for reviewing, approving, and submitting any
              claim prepared with the Service, and for the accuracy of the
              information you submit.
            </>,
          ],
        },
        {
          heading: "Accounts and security",
          paragraphs: [
            <>
              To use the Service you may need to create an account. You agree
              to provide accurate, current, and complete information and to
              keep it up to date. You are responsible for safeguarding your
              credentials and for all activity that occurs under your account.
            </>,
            <>
              You must promptly notify us at{" "}
              <a
                href="mailto:support@verito.online"
                className="text-teal underline underline-offset-2"
              >
                support@verito.online
              </a>{" "}
              if you suspect unauthorized access to your account.
            </>,
          ],
        },
        {
          heading: "Amazon Seller Central authorization",
          paragraphs: [
            <>
              To provide the Service, we access your Amazon Seller Central
              account through Amazon&apos;s official OAuth flow (including
              Amazon&apos;s Selling Partner API). This access is{" "}
              <strong>read-only</strong>: we never list products, change
              prices, place orders, or take other actions in your account.
            </>,
            <>
              You may revoke our access at any time, either from the
              “Connections” area of the Verito app or directly in Amazon
              Seller Central. Revoking access may limit or stop Service
              functionality but does not affect your rights under these Terms.
            </>,
            <>
              Your use of Amazon&apos;s services remains subject to
              Amazon&apos;s own terms and policies. You agree to use the
              Service only in ways that comply with Amazon&apos;s then-current
              Selling Partner API terms and Seller Central policies.
            </>,
          ],
        },
        {
          heading: "No financial, legal, or tax advice",
          paragraphs: [
            <>
              The Service provides analysis, estimates, and claim preparation
              tools. It does not provide legal, financial, accounting, or tax
              advice, and nothing in the Service guarantees that any
              reimbursement will be approved or paid. Recovery decisions rest
              entirely with Amazon under its reimbursement policies.
            </>,
            <>
              Any recovery estimates, recovery scores, or deadlines shown in
              the Service are estimates based on the data available to us and
              may differ from Amazon&apos;s actual determinations.
            </>,
          ],
        },
        {
          heading: "Plans, billing, and cancellation",
          paragraphs: [
            <>
              <strong>Free plan.</strong> The free plan includes up to 5
              prepared claims per calendar month. If you exceed the monthly
              allowance, the Service will pause further claim preparation until
              the next month or until you upgrade.
            </>,
            <>
              <strong>Pro subscription.</strong> The Pro plan is billed as a
              recurring subscription of $49.00 per month (or such other price
              as displayed at checkout) through our payment processor, Creem.
              Charges appear on your statement as Creem / Verito. Payment is
              due at the start of each billing cycle and is non-refundable
              except as required by applicable law.
            </>,
            <>
              <strong>Cancellation.</strong> You may cancel your subscription
              at any time from the app or by contacting support. After
              cancellation you retain access through the end of the paid
              period; the subscription will not renew and you will not be
              charged again.
            </>,
            <>
              We may change pricing or plan terms in the future. We will give
              you reasonable notice of changes that affect existing
              subscriptions, and changes will take effect at the next renewal
              or billing cycle.
            </>,
          ],
        },
        {
          heading: "Acceptable use",
          paragraphs: [
            <>
              You agree not to misuse the Service, including by:
            </>,
          ],
          list: [
            "using the Service to prepare or submit knowingly false or fraudulent claims;",
            "violating Amazon, Creem, or other third-party terms or policies;",
            "attempting to access, scrape, or interfere with the Service or its underlying systems beyond normal use;",
            "using the Service for unlawful, deceptive, or abusive purposes;",
            "reverse engineering, decompiling, or attempting to extract the source code of the Service;",
            "impersonating another person or entity, or providing false authorization information.",
          ],
        },
        {
          heading: "Intellectual property",
          paragraphs: [
            <>
              The Service, including its software, design, branding,
              documentation, and generated templates, is owned by or licensed
              to Verito and is protected by intellectual property laws. We
              grant you a limited, non-exclusive, non-transferable,
              revocable license to use the Service for your own internal
              business purposes, subject to these Terms.
            </>,
            <>
              You retain all rights to your own data, including your Amazon
              data and your claim records. You grant us a license to process,
              store, and display your data solely to provide and improve the
              Service, as described in our Privacy Policy.
            </>,
          ],
        },
        {
          heading: "AI-assisted analysis",
          paragraphs: [
            <>
              The Service uses automated and AI-assisted analysis to detect
              discrepancies and assemble evidence. Automated outputs may be
              incomplete or inaccurate. Before submitting any claim, you are
              responsible for verifying the underlying facts and evidence
              against your own records. Verito never presents automated
              statements as facts to Amazon; you control what is submitted.
            </>,
          ],
        },
        {
          heading: "Third-party services",
          paragraphs: [
            <>
              The Service depends on third-party providers, including Amazon
              (Seller Central and Selling Partner API), our hosting and
              database provider, and Creem (payment processing). We are not
              responsible for the availability, performance, policies, or
              actions of these third parties, and we may be required to change
              or discontinue features if a provider changes its API or terms.
            </>,
          ],
        },
        {
          heading: "Disclaimers of warranty",
          paragraphs: [
            <>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED
              “AS IS” AND “AS AVAILABLE,” WITHOUT WARRANTIES OF ANY KIND,
              WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
              NON-INFRINGEMENT, AND ACCURACY. WE DO NOT WARRANT THAT THE
              SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR THAT ANY
              RECOVERY WILL BE REALIZED.
            </>,
          ],
        },
        {
          heading: "Limitation of liability",
          paragraphs: [
            <>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, VERITO AND ITS
              AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS WILL NOT
              BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
              OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST REVENUE, LOST
              DATA, OR LOST RECOVERY, ARISING OUT OF OR RELATING TO YOUR USE OF
              OR INABILITY TO USE THE SERVICE.
            </>,
            <>
              OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO
              THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A)
              THE AMOUNTS YOU ACTUALLY PAID US FOR THE SERVICE IN THE TWELVE
              (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS
              ($100).
            </>,
            <>
              Certain jurisdictions do not allow the exclusion or limitation
              of certain warranties or liabilities, so some of the above
              limitations may not apply to you.
            </>,
          ],
        },
        {
          heading: "Indemnification",
          paragraphs: [
            <>
              You agree to indemnify, defend, and hold harmless Verito and its
              affiliates, officers, directors, employees, and agents from and
              against any claims, damages, losses, liabilities, and reasonable
              expenses (including attorneys&apos; fees) arising out of or
              relating to (a) your use of the Service, (b) your Amazon Seller
              Central account and the data you provide, (c) any claim you
              prepare or submit using the Service, or (d) your violation of
              these Terms or applicable law.
            </>,
          ],
        },
        {
          heading: "Termination",
          paragraphs: [
            <>
              You may stop using the Service at any time and cancel your
              subscription as described above. We may suspend or terminate
              your access to the Service, in whole or in part, if we believe
              you have violated these Terms or applicable law, if your
              subscription is not paid, or as required by our third-party
              providers.
            </>,
            <>
              Sections of these Terms that by their nature should survive
              termination — including intellectual property, disclaimers,
              limitation of liability, indemnification, and governing law —
              will survive any termination of your access.
            </>,
          ],
        },
        {
          heading: "Changes to these Terms",
          paragraphs: [
            <>
              We may update these Terms from time to time. When we do, we will
              revise the “Last updated” date above and, for material changes,
              notify you by email or through the Service. Your continued use
              of the Service after the revised Terms take effect constitutes
              acceptance of the revised Terms.
            </>,
          ],
        },
        {
          heading: "Governing law and disputes",
          paragraphs: [
            <>
              These Terms are governed by the laws of the State of Delaware,
              United States, without regard to its conflict-of-laws
              principles.
            </>,
            <>
              Before initiating any proceeding, you agree to contact us at{" "}
              <a
                href="mailto:support@verito.online"
                className="text-teal underline underline-offset-2"
              >
                support@verito.online
              </a>{" "}
              and attempt to resolve the dispute informally for thirty (30)
              days. If the dispute is not resolved, you agree that any legal
              action will be brought exclusively in the state or federal
              courts located in Delaware, and you consent to the personal
              jurisdiction of those courts.
            </>,
          ],
        },
        {
          heading: "Contact us",
          paragraphs: [
            <>
              Questions about these Terms may be sent to{" "}
              <a
                href="mailto:support@verito.online"
                className="text-teal underline underline-offset-2"
              >
                support@verito.online
              </a>{" "}
              or by mail to VTPlatform, Verito Legal, care of the address
              shown on verito.online.
            </>,
          ],
        },
      ]}
    />
  );
}
