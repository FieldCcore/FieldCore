'use client';
import { useState } from 'react';

const FAQ_GROUPS = [
  {
    title: 'General',
    items: [
      {
        q: 'What is FieldCore?',
        a: 'FieldCore is a field-service management platform that replaces the mix of apps, spreadsheets, and personal phones most service businesses use today. It combines scheduling, dispatch, client management, invoicing, payments, communications, and team management in one platform.',
      },
      {
        q: 'Who is FieldCore built for?',
        a: 'FieldCore is built for field-service businesses that send technicians to customer locations — mobile detailers, HVAC technicians, plumbers, electricians, landscapers, pressure washers, pool services, pest control, appliance repair, and related trades.',
      },
      {
        q: 'What types of businesses use FieldCore?',
        a: 'FieldCore is used by businesses ranging from solo operators to multi-location service companies with large teams. If you schedule jobs, send technicians, and collect payments from customers, FieldCore is built for you.',
      },
    ],
  },
  {
    title: 'Features',
    items: [
      {
        q: 'Can I schedule recurring services?',
        a: 'Yes. FieldCore supports weekly, bi-weekly, monthly, and custom recurring job schedules. Billing runs automatically on recurring jobs. You can set recurring schedules at the client level or for individual jobs.',
      },
      {
        q: 'Can multiple technicians work on one job?',
        a: 'Yes. FieldCore supports multi-tech job assignments. You can assign a primary technician and additional team members to any job, and dispatch them together from the Dispatch board.',
      },
      {
        q: 'Does FieldCore support projects and work orders?',
        a: 'Yes. The Projects module lets you manage complex, multi-day jobs with structured work orders, task checklists, budget vs actual tracking, change orders, and activity history. Work orders integrate directly with the Calendar and Dispatch.',
      },
      {
        q: 'Can I create invoices and collect payments?',
        a: 'Yes. FieldCore generates invoices automatically at job completion and lets customers pay online via credit or debit card. You can also store cards on file, collect deposits, and set up automated recurring billing.',
      },
      {
        q: 'Can FieldCore manage multiple vehicles or equipment?',
        a: 'Yes. Fleet management is available on Pro and Scale plans. You can track vehicles, assign them to jobs, and attach equipment to work orders for cost tracking.',
      },
      {
        q: 'Can I manage multiple employees?',
        a: 'Yes. FieldCore supports unlimited team members at all plan tiers with no per-user fees. Role-based access controls let you define what each team member can see and do.',
      },
    ],
  },
  {
    title: 'Plans & Pricing',
    items: [
      {
        q: 'Are there per-user fees?',
        a: 'No. FieldCore never charges per user at any plan tier. Your subscription covers your entire team.',
      },
      {
        q: 'Is there a free trial?',
        a: 'Yes. You can start a free trial on any plan without a credit card. Upgrade when you\'re ready.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. There are no long-term contracts or cancellation penalties. You can cancel from your account settings at any time.',
      },
      {
        q: 'What is included on each plan?',
        a: 'Solo ($49/mo) covers one operator with full scheduling, invoicing, and communications. Pro ($99/mo) adds team members, call recording, No-Show Clock, Smart Caller ID, and advanced billing features. Scale ($199/mo) adds multi-entity management, multiple phone numbers, and advanced reporting. See the Pricing page for the full comparison.',
      },
    ],
  },
  {
    title: 'Getting Started',
    items: [
      {
        q: 'How long does it take to set up?',
        a: 'Most operators are scheduling jobs within their first session. There is no lengthy implementation, no required training, and no setup fees. You configure your business settings and start using FieldCore the same day.',
      },
      {
        q: 'Do my customers need to download anything?',
        a: 'No. Customers receive appointment confirmations, reminders, invoices, and payment links via SMS and email. They pay and sign directly from their phone without downloading an app.',
      },
      {
        q: 'Does FieldCore have a mobile app?',
        a: 'Yes. FieldCore has a mobile app for field technicians that handles job check-in, task checklists, customer signatures, photo documentation, and ETA sending. The app is available for iOS and Android.',
      },
    ],
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-item">
      <button className="faq-question" onClick={() => setOpen(!open)} aria-expanded={open}>
        {q}
        <span className={`faq-icon${open ? ' open' : ''}`} aria-hidden="true">+</span>
      </button>
      {open && (
        <div className="faq-answer-inner">
          {a}
        </div>
      )}
    </div>
  );
}

export default function FaqAccordion() {
  return (
    <div className="faq-groups">
      {FAQ_GROUPS.map((group) => (
        <div key={group.title}>
          <div className="faq-group-title">{group.title}</div>
          {group.items.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      ))}
    </div>
  );
}
