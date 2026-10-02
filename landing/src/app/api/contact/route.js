import { NextResponse } from 'next/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, company, phone, topic, message } = body;

    if (!name?.trim() || !email?.trim() || !topic?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'Name, email, topic, and message are required.' }, { status: 400 });
    }

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (message.trim().length < 10) {
      return NextResponse.json({ error: 'Message is too short. Please provide more detail.' }, { status: 400 });
    }

    // Server-side log — email notification requires SMTP configuration via CONTACT_EMAIL env var
    console.log('[FieldCore Contact]', {
      name: name.trim(),
      email: email.trim(),
      company: company?.trim() || null,
      phone: phone?.trim() || null,
      topic: topic.trim(),
      messageLength: message.trim().length,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[FieldCore Contact] Error:', err);
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
