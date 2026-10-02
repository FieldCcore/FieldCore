import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'SMS Terms | FieldCore',
  description: 'FieldCore SMS Terms and Conditions. Review the terms governing SMS communications sent through the FieldCore platform.',
};

const EFFECTIVE = 'September 1, 2026';

export default function SmsTermsPage() {
  return (
    <>
      <Nav />
      <div className="legal-wrap">
        <div className="legal-content">
          <h1 className="legal-title">SMS Terms &amp; Conditions</h1>
          <p className="legal-updated">Effective date: {EFFECTIVE}</p>

          <div className="legal-section">
            <p>
              These SMS Terms and Conditions ("SMS Terms") govern the use of text message (SMS/MMS)
              communication features provided through the FieldCore platform. By enabling SMS features
              in your FieldCore account, you agree to these SMS Terms.
            </p>
          </div>

          <div className="legal-section">
            <h2>1. About FieldCore SMS Features</h2>
            <p>
              FieldCore provides business operators with the ability to send SMS and MMS messages to
              their customers for legitimate business purposes, including:
            </p>
            <ul>
              <li>Appointment confirmations and scheduling reminders</li>
              <li>ETA and arrival notifications</li>
              <li>Job status updates</li>
              <li>Invoice delivery and payment requests</li>
              <li>No-show and cancellation notices</li>
              <li>Pre-charge advance notices for recurring billing</li>
              <li>Two-way customer communication</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>2. Operator Responsibilities</h2>
            <p>
              As a FieldCore operator using SMS features, you are the entity sending messages to
              your customers. You are responsible for:
            </p>
            <ul>
              <li>Obtaining appropriate consent from recipients before sending messages</li>
              <li>Complying with all applicable laws and regulations, including the Telephone Consumer Protection Act (TCPA) and any state equivalents</li>
              <li>Providing recipients with a clear opt-out mechanism</li>
              <li>Honoring opt-out requests promptly</li>
              <li>Using SMS features only for legitimate business communications with your existing customers</li>
              <li>Not using SMS features for marketing to individuals who have not consented to receive marketing messages</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>3. Customer Consent Requirements</h2>
            <p>
              Before sending automated messages to your customers, you must have obtained their
              express written consent to receive SMS communications from your business. Consent
              should clearly disclose:
            </p>
            <ul>
              <li>That they are consenting to receive automated text messages</li>
              <li>The types of messages they will receive</li>
              <li>The approximate frequency of messages</li>
              <li>That message and data rates may apply</li>
              <li>How to opt out (reply STOP)</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>4. Opt-Out Handling</h2>
            <p>
              FieldCore processes opt-out requests automatically. When a recipient replies STOP,
              CANCEL, UNSUBSCRIBE, END, or QUIT to a FieldCore-delivered message, they are removed
              from further automated messaging. You may not send further automated messages to a
              customer who has opted out without obtaining fresh consent.
            </p>
          </div>

          <div className="legal-section">
            <h2>5. Prohibited Uses</h2>
            <p>You may not use FieldCore SMS features to send:</p>
            <ul>
              <li>Unsolicited commercial messages (spam)</li>
              <li>Phishing, fraudulent, or deceptive content</li>
              <li>Threats, harassment, or abusive content</li>
              <li>Content that violates any applicable law</li>
              <li>Messages to numbers on do-not-call or opt-out lists</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>6. Message Rates and Delivery</h2>
            <p>
              Message and data rates may apply to recipients based on their mobile carrier plan.
              FieldCore is not responsible for carrier delivery failures, delays, or charges incurred
              by message recipients.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. 10DLC Registration</h2>
            <p>
              US business SMS requires registration with the mobile carrier ecosystem (10DLC — 10-digit
              long code). By using FieldCore SMS features, you represent that your messaging program
              complies with carrier requirements and that all submitted registration information is
              accurate.
            </p>
          </div>

          <div className="legal-section">
            <h2>8. Suspension and Termination</h2>
            <p>
              FieldCore may immediately suspend or terminate your access to SMS features if you
              violate these SMS Terms, receive excessive complaints, or are determined to be engaging
              in prohibited activities. Suspension will not relieve you of liability for messages
              already sent.
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Help and Support</h2>
            <p>
              Recipients may text HELP to receive information about the messaging program and support
              contact information. For assistance with FieldCore SMS features, contact:
            </p>
            <div className="legal-contact-box">
              <p><strong>FieldCore SMS Support</strong></p>
              <p>support@getfieldcore.com</p>
              <p>Reply STOP to any message to opt out.</p>
              <p>Reply HELP for assistance.</p>
              <p>Message and data rates may apply.</p>
            </div>
          </div>

          <div className="legal-section">
            <h2>10. Changes to SMS Terms</h2>
            <p>
              FieldCore may update these SMS Terms to reflect changes in carrier requirements,
              legal obligations, or platform capabilities. Continued use of SMS features after
              the effective date of any update constitutes acceptance.
            </p>
          </div>

          <div className="legal-section">
            <h2>11. Contact</h2>
            <div className="legal-contact-box">
              <p><strong>FieldCore Inc.</strong></p>
              <p>legal@getfieldcore.com</p>
              <p>Delaware C-Corp</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
