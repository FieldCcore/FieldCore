import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Privacy Policy | FieldCore',
  description: 'FieldCore Privacy Policy. Learn how we collect, use, and protect your personal information.',
};

const EFFECTIVE = 'September 1, 2026';

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <div className="legal-wrap">
        <div className="legal-content">
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-updated">Effective date: {EFFECTIVE}</p>

          <div className="legal-section">
            <p>
              FieldCore Inc. ("FieldCore," "we," "our," or "us") is committed to protecting the privacy
              of the businesses and individuals who use our platform. This Privacy Policy explains how we
              collect, use, disclose, and protect personal information in connection with the FieldCore
              service.
            </p>
          </div>

          <div className="legal-section">
            <h2>1. Information We Collect</h2>
            <h3>Account Information</h3>
            <p>
              When you create a FieldCore account, we collect your name, email address, business name,
              phone number, and billing information.
            </p>
            <h3>Business and Operational Data</h3>
            <p>
              To provide the Service, we process information you enter about your business operations:
              client names, addresses, phone numbers, job records, invoices, payment records, and
              communication history. This data belongs to you as described in our Terms of Service.
            </p>
            <h3>Usage Information</h3>
            <p>
              We automatically collect information about how you use FieldCore, including pages visited,
              features used, device type, browser, IP address, and session timestamps.
            </p>
            <h3>Communications</h3>
            <p>
              If you use FieldCore's communication features (SMS, voice), records of those communications
              may be stored as part of the Service.
            </p>
            <h3>Payment Information</h3>
            <p>
              Payment card information is processed by our payment processor and is not stored on
              FieldCore systems in unencrypted form.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide, operate, and improve the FieldCore platform</li>
              <li>Process payments and subscriptions</li>
              <li>Send transactional communications (receipts, confirmations, alerts)</li>
              <li>Provide customer support</li>
              <li>Detect, prevent, and investigate fraud or security incidents</li>
              <li>Comply with legal obligations</li>
              <li>Send product updates and marketing communications (with the ability to opt out)</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>3. How We Share Your Information</h2>
            <p>We do not sell your personal information. We share information in the following circumstances:</p>
            <h3>Service Providers</h3>
            <p>
              We share information with third-party vendors who help us operate FieldCore, including
              payment processors, cloud hosting providers, telephony services, and analytics tools.
              These providers are contractually required to protect your information.
            </p>
            <h3>Legal Requirements</h3>
            <p>
              We may disclose information when required by law, court order, or government authority,
              or to protect the rights, property, or safety of FieldCore, our users, or the public.
            </p>
            <h3>Business Transfers</h3>
            <p>
              If FieldCore is acquired, merged, or undergoes a similar transaction, your information
              may be transferred as part of that transaction.
            </p>
          </div>

          <div className="legal-section">
            <h2>4. Your Customers' Data</h2>
            <p>
              When you use FieldCore to manage your customers, you are the data controller for your
              customers' personal information. You are responsible for ensuring you have an appropriate
              legal basis for processing your customers' data and for providing them with appropriate
              privacy disclosures.
            </p>
          </div>

          <div className="legal-section">
            <h2>5. Data Security</h2>
            <p>
              FieldCore implements industry-standard technical and organizational measures to protect
              your information, including encryption in transit (TLS) and at rest, access controls,
              and regular security assessments. No system is completely secure; we cannot guarantee
              absolute security.
            </p>
          </div>

          <div className="legal-section">
            <h2>6. Data Retention</h2>
            <p>
              We retain your information for as long as your account is active or as needed to provide
              the Service. You may request deletion of your account and associated data. Certain
              information may be retained as required by law or for legitimate business purposes
              (fraud prevention, dispute resolution, legal obligations).
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Cookies and Tracking</h2>
            <p>
              FieldCore uses cookies and similar technologies to operate the Service, remember
              preferences, and analyze usage. Essential cookies are required for the Service to
              function. You may control non-essential cookies through your browser settings.
            </p>
          </div>

          <div className="legal-section">
            <h2>8. Your Rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct, delete, or
              restrict processing of your personal information. To exercise these rights, contact
              us at privacy@getfieldcore.com. We will respond to requests within 30 days.
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Children's Privacy</h2>
            <p>
              FieldCore is not directed at children under 18 and does not knowingly collect
              personal information from minors. If you believe a minor has provided us with
              personal information, please contact us.
            </p>
          </div>

          <div className="legal-section">
            <h2>10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              communicated via email or in-app notification with at least 14 days' notice.
              Continued use of FieldCore after the effective date constitutes acceptance of
              the updated policy.
            </p>
          </div>

          <div className="legal-section">
            <h2>11. Contact</h2>
            <div className="legal-contact-box">
              <p><strong>FieldCore Inc. — Privacy</strong></p>
              <p>privacy@getfieldcore.com</p>
              <p>Delaware C-Corp</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
