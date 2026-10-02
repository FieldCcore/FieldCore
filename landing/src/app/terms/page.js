import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Terms of Service | FieldCore',
  description: 'FieldCore Terms of Service. Review the terms that govern your use of the FieldCore platform.',
};

const EFFECTIVE = 'September 1, 2026';

export default function TermsPage() {
  return (
    <>
      <Nav />
      <div className="legal-wrap">
        <div className="legal-content">
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-updated">Effective date: {EFFECTIVE}</p>

          <div className="legal-section">
            <p>
              These Terms of Service ("Terms") govern your access to and use of the FieldCore platform,
              including any associated mobile applications, APIs, and related services (collectively, the "Service"),
              operated by FieldCore Inc. ("FieldCore," "we," "our," or "us").
            </p>
            <p>
              By accessing or using the Service, you agree to be bound by these Terms. If you do not agree,
              do not access or use the Service. If you are using the Service on behalf of a business,
              you represent that you have authority to bind that business to these Terms.
            </p>
          </div>

          <div className="legal-section">
            <h2>1. Accounts and Access</h2>
            <p>
              To use FieldCore, you must create an account and provide accurate, current, and complete
              information. You are responsible for maintaining the confidentiality of your login credentials
              and for all activity that occurs under your account.
            </p>
            <p>
              You must be at least 18 years old to use the Service. You may not share your account with
              others or allow others to access the Service using your credentials.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. Subscription and Billing</h2>
            <p>
              FieldCore offers subscription-based plans billed on a monthly or annual basis.
              Pricing is available on the Pricing page. By subscribing, you authorize FieldCore to
              charge your payment method on a recurring basis.
            </p>
            <p>
              Subscriptions renew automatically unless cancelled before the next billing period.
              You may cancel your subscription at any time through your account settings.
              Cancellation takes effect at the end of the current billing period; no partial refunds
              are provided for unused time.
            </p>
            <p>
              FieldCore reserves the right to change pricing with at least 30 days' advance notice.
              Continued use of the Service after a price change constitutes acceptance of the new pricing.
            </p>
          </div>

          <div className="legal-section">
            <h2>3. Acceptable Use</h2>
            <p>You agree not to use the Service to:</p>
            <ul>
              <li>Violate any applicable law, regulation, or third-party rights</li>
              <li>Transmit unsolicited communications (spam)</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Attempt to gain unauthorized access to the Service or other accounts</li>
              <li>Use the Service for any fraudulent or deceptive purpose</li>
              <li>Scrape, crawl, or systematically download data from the Service without authorization</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>4. Customer Data</h2>
            <p>
              You retain ownership of all data you input into FieldCore, including client information,
              job records, and business data ("Customer Data"). You grant FieldCore a limited license
              to process Customer Data solely to provide the Service to you.
            </p>
            <p>
              FieldCore will not sell Customer Data to third parties. Customer Data handling is
              governed by our Privacy Policy.
            </p>
          </div>

          <div className="legal-section">
            <h2>5. Payment Processing</h2>
            <p>
              FieldCore facilitates payment processing through third-party payment processors.
              By enabling payment features, you agree to the terms of the applicable payment processor.
              FieldCore is not responsible for payment processor errors, delays, or disputes.
            </p>
            <p>
              You are responsible for ensuring that charges to your customers are lawful, accurate,
              and appropriately disclosed.
            </p>
          </div>

          <div className="legal-section">
            <h2>6. Communications Features</h2>
            <p>
              FieldCore provides SMS and voice communication features for business use. By using
              these features, you agree to comply with all applicable telecommunications laws,
              including the Telephone Consumer Protection Act (TCPA). You are responsible for
              obtaining appropriate consent from your customers before sending automated messages.
            </p>
            <p>
              See our SMS Terms for additional terms applicable to messaging features.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Intellectual Property</h2>
            <p>
              The Service, including all software, interfaces, content, and marks, is owned by
              FieldCore or its licensors. Nothing in these Terms grants you ownership of any
              FieldCore intellectual property. You may not use FieldCore's name, logo, or marks
              without prior written consent.
            </p>
          </div>

          <div className="legal-section">
            <h2>8. Third-Party Services</h2>
            <p>
              The Service may integrate with third-party services (mapping, payments, telephony).
              FieldCore is not responsible for third-party service availability, accuracy, or
              conduct. Your use of third-party services is governed by their respective terms.
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
              EXPRESS OR IMPLIED. FIELDCORE DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
              ERROR-FREE, OR SECURE, OR THAT ANY DEFECTS WILL BE CORRECTED.
            </p>
          </div>

          <div className="legal-section">
            <h2>10. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, FIELDCORE SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS,
              DATA, OR BUSINESS OPPORTUNITIES, ARISING FROM YOUR USE OF THE SERVICE.
            </p>
            <p>
              FIELDCORE'S TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THESE TERMS OR THE SERVICE
              SHALL NOT EXCEED THE AMOUNT YOU PAID TO FIELDCORE IN THE TWELVE MONTHS PRECEDING
              THE CLAIM.
            </p>
          </div>

          <div className="legal-section">
            <h2>11. Termination</h2>
            <p>
              Either party may terminate the account at any time. FieldCore may suspend or terminate
              your access immediately if you violate these Terms. Upon termination, your right to
              access the Service ceases. You may request an export of your Customer Data within
              30 days of termination.
            </p>
          </div>

          <div className="legal-section">
            <h2>12. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Delaware, without regard to
              conflict of law principles. Disputes shall be resolved in the state or federal courts
              located in Delaware.
            </p>
          </div>

          <div className="legal-section">
            <h2>13. Changes to These Terms</h2>
            <p>
              FieldCore may update these Terms from time to time. We will provide at least 14 days'
              notice of material changes via email or in-app notification. Continued use of the
              Service after the effective date constitutes acceptance of the updated Terms.
            </p>
          </div>

          <div className="legal-section">
            <h2>14. Contact</h2>
            <div className="legal-contact-box">
              <p><strong>FieldCore Inc.</strong></p>
              <p>Delaware C-Corp</p>
              <p>legal@getfieldcore.com</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
