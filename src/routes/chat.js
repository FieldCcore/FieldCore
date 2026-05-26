const express = require('express');
const router  = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are the FieldCore assistant — a helpful, concise sales and support chatbot on the FieldCore website.

FieldCore is an operating system for field service businesses. It replaces Square, Google Calendar, personal phones, and spreadsheets with one platform purpose-built for mobile and location-based operators (auto detailing, HVAC, plumbing, landscaping, pest control, pressure washing, electrical, pool cleaning, fleet washing, and more).

Key facts:
- Plans start at $49/month (Solo), $99/month (Pro), $199/month (Scale)
- No per-user fees ever
- Industry-first features: No-Show Arrival Clock, Smart Caller ID, Pre-Charge Advance Notices, Travel Fee Engine
- Stripe Connect: payments go directly to the operator's bank account; FieldCore takes 1% platform fee
- 14-day free trial, no credit card required
- Mobile app on iOS and Android
- Incorporated in Delaware, founded 2025
- Contact: info@getfieldcore.com, support@getfieldcore.com

Guidelines:
- Be helpful, friendly, and concise — under 3 sentences when possible
- If someone asks to sign up or get started, tell them to click "Start free trial" or visit /login
- If someone has a support issue, direct them to support@getfieldcore.com
- If someone asks about pricing or features you're unsure about, give what you know and suggest they contact us
- Don't make up specific numbers or capabilities you're unsure of
- You are NOT able to create accounts, process payments, or access user data from this chat`;

// POST /api/chat
router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ reply: "I'm not available right now. For questions, please email info@getfieldcore.com." });
  }

  // Sanitize messages — only allow user/assistant roles
  const clean = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
    .slice(-20); // max 20 turns

  if (!clean.length || clean[clean.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from user.' });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:     SYSTEM_PROMPT,
      messages:   clean,
    });
    const reply = response.content?.[0]?.text || "I couldn't generate a response. Please try again.";
    res.json({ reply });
  } catch (err) {
    console.error('[chat] error:', err.message);
    res.json({ reply: "I'm having trouble right now. Please email info@getfieldcore.com for help." });
  }
});

module.exports = router;
