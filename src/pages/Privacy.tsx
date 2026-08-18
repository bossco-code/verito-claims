import { LegalLayout } from "@/components/verito/LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Privacy Policy"
      updated="August 13, 2026"
      intro="This Privacy Policy explains what information Verito (operated by VTPlatform, “we,” “us,” or “our”) collects through the Verito application and website at verito.online (the “Service”), how we use it, and the choices you have. By using the Service you agree to the collection and use of information as described in this policy."
      sections={[
        {
          heading: "Overview",
          paragraphs: [
            <>
              Verito is an AI operations assistant for Amazon sellers. To work,
              the Service needs access to your Amazon Seller Central data so
              it can detect reimbursement opportunities and prepare claim
              packages. We treat that data as sensitive: it is accessed
              read-only, used only to provide the Service, and never sold.
            </>,
          ],
        },
        {
          heading: "Information we collect",
          paragraphs: [
            <strong key="intro">We collect the following categories of information:</strong>,
          ],
          list: [
            <><strong>Account information</strong> — your email address, name, and the identifier assigned by your sign-in provider when you create an account or sign in with an email code.</>,
            <><strong>Amazon Seller Central data</strong> — with your explicit OAuth authorization, we collect the selling data needed to provide the Service, including order, shipment, inventory, returns, and financial records related to your reimbursement analysis. Access is read-only.</>,
            <><strong>Claim and case data</strong> — the evidence cases, claim candidates, and claim packages you create in the Service.</>,
            <><strong>Usage information</strong> — pages visited, features used, and similar technical logs used to operate and improve the Service.</>,
            <><strong>Payment and subscription information</strong> — processed by our payment provider, Creem. We receive the subscription status, plan, and billing email needed to manage your plan; we do not store full card numbers.</>,
            <><strong>Communications</strong> — anything you send us through support or contact forms.</>,
          ],
        },
        {
          heading: "How we use your information",
          paragraphs: [
            <>
              We use the information we collect to:
            </>,
          ],
          list: [
            "provide and operate the Service, including detecting discrepancies and preparing claim packages;",
            "enforce your plan limits (for example, the 5 prepared claims per month on the free plan);",
            "communicate with you about the Service, billing, and changes to our policies;",
            "secure the Service, prevent fraud and abuse, and respond to support requests;",
            "comply with legal obligations; and",
            "improve the Service using aggregated or de-identified information.",
          ],
        },
        {
          heading: "Legal bases for processing (EEA, UK, and Switzerland)",
          paragraphs: [
            <>
              If you are located in the European Economic Area, the United
              Kingdom, or Switzerland, our legal bases for processing your
              personal information are: performance of the contract with you
              (providing the Service), your consent (for example, Amazon data
              access), our legitimate interests (operating, securing, and
              improving the Service), and compliance with legal obligations.
              You may withdraw consent at any time without affecting the
              lawfulness of processing based on consent before its withdrawal.
            </>,
          ],
        },
        {
          heading: "Amazon data and access",
          paragraphs: [
            <>
              When you connect Amazon Seller Central, you authorize us, through
              Amazon&apos;s official OAuth flow, to read the data described
              above. We never write to your Amazon account: we cannot list
              products, change prices, or place orders.
            </>,
            <>
              You can revoke our access at any time from the Service or from
              Amazon Seller Central. Revoking access stops new data collection;
              information already collected remains subject to this policy
              until you request its deletion.
            </>,
            <>
              Amazon processes its own copy of your data under Amazon&apos;s
              terms and privacy policies. This policy does not govern
              Amazon&apos;s handling of your information.
            </>,
          ],
        },
        {
          heading: "How we share information",
          paragraphs: [
            <>
              We do not sell your personal information. We share information
              only in the following circumstances:
            </>,
          ],
          list: [
            <><strong>Service providers</strong> — hosting and database providers that store and process data on our behalf, our payment processor (Creem) for billing and subscription management, and Amazon (Selling Partner API) for the data access you authorized. Each provider is bound to use the data only to perform services for us.</>,
            <><strong>Legal and regulatory purposes</strong> — when required by law, subpoena, or legal process, or when we reasonably believe disclosure is necessary to protect our rights, your safety, or the safety of others.</>,
            <><strong>Business transfers</strong> — in connection with a merger, acquisition, reorganization, or sale of assets, in which case we will require the recipient to honor this policy (or provide notice of changes).</>,
          ],
        },
        {
          heading: "Retention",
          paragraphs: [
            <>
              We retain your information for as long as your account is active
              and for as long as needed to provide the Service, enforce our
              Terms, and comply with legal obligations. Amazon data is used
              for ongoing analysis and claim preparation; you may request
              deletion of your account and associated data at any time, after
              which we will delete or anonymize it within a reasonable period
              unless we are required to keep it by law.
            </>,
          ],
        },
        {
          heading: "Security",
          paragraphs: [
            <>
              We use industry-standard measures to protect your information,
              including encryption in transit, restricted access to systems
              that hold your data, and secure storage of any API credentials.
              No method of transmission or storage is completely secure, and
              we cannot guarantee absolute security. Please notify us at{" "}
              <a
                href="mailto:privacy@verito.online"
                className="text-teal underline underline-offset-2"
              >
                privacy@verito.online
              </a>{" "}
              if you become aware of any security concern.
            </>,
          ],
        },
        {
          heading: "Your rights and choices",
          paragraphs: [
            <>
              Depending on where you live, you may have rights to access,
              correct, delete, or obtain a copy of your personal information,
              to restrict or object to certain processing, and to data
              portability. If you are in California, the CCPA/CPRA provides
              similar rights, including the right to know what we collect and
              to request deletion, and the right not to be discriminated
              against for exercising those rights.
            </>,
            <>
              To exercise any of these rights, email{" "}
              <a
                href="mailto:privacy@verito.online"
                className="text-teal underline underline-offset-2"
              >
                privacy@verito.online
              </a>{" "}
              from the email address associated with your account. We will
              verify your identity before acting on your request and will
              respond within the time required by applicable law (typically 30
              days).
            </>,
            <>
              You can also disconnect Amazon Seller Central and cancel your
              subscription at any time from within the Service.
            </>,
          ],
        },
        {
          heading: "Cookies and similar technologies",
          paragraphs: [
            <>
              We use cookies and similar technologies that are strictly
              necessary for authentication and security (for example, to keep
              you signed in). We do not use third-party advertising cookies or
              sell data collected through cookies. Analytics, where used, is
              based on aggregated, de-identified information.
            </>,
          ],
        },
        {
          heading: "International transfers",
          paragraphs: [
            <>
              Your information may be processed in the United States and in
              other countries where our service providers operate. When we
              transfer personal information across borders, we rely on
              appropriate safeguards, including standard contractual clauses
              approved by the European Commission where required.
            </>,
          ],
        },
        {
          heading: "Children",
          paragraphs: [
            <>
              The Service is intended for business users who are at least 18
              years old. We do not knowingly collect personal information from
              children under 16. If you believe a child has provided us
              personal information, contact us and we will delete it.
            </>,
          ],
        },
        {
          heading: "Changes to this policy",
          paragraphs: [
            <>
              We may update this Privacy Policy from time to time. We will
              revise the “Last updated” date above and notify you of material
              changes by email or through the Service. Your continued use of
              the Service after changes take effect constitutes acceptance of
              the updated policy.
            </>,
          ],
        },
        {
          heading: "Contact us",
          paragraphs: [
            <>
              Questions or requests regarding this Privacy Policy can be sent
              to{" "}
              <a
                href="mailto:privacy@verito.online"
                className="text-teal underline underline-offset-2"
              >
                privacy@verito.online
              </a>{" "}
              or{" "}
              <a
                href="mailto:support@verito.online"
                className="text-teal underline underline-offset-2"
              >
                support@verito.online
              </a>
              .
            </>,
          ],
        },
      ]}
    />
  );
}
