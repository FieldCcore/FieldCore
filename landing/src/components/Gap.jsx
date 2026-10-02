'use client';
import { useEffect, useRef } from 'react';

// ── Scroll-reveal via IntersectionObserver ────────────────────────────────────
function useReveal(ref) {
  useEffect(() => {
    if (!ref.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const items = ref.current.querySelectorAll('.gap-reveal');
    if (reduced) {
      items.forEach(el => el.classList.add('gap-revealed'));
      return;
    }
    const io = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('gap-revealed');
          io.unobserve(entry.target);
        }
      }),
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
    );
    items.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ── Authority Document card ───────────────────────────────────────────────────
function AuthDocCard() {
  return (
    <div className="gap-source gap-source-doc">
      <div className="gap-source-header">
        <span className="gap-source-type">Authority document</span>
        <span className="gap-source-badge">Verified copy</span>
      </div>
      <p className="gap-source-title">Durable Power of Attorney</p>
      <div className="gap-source-meta">
        <span className="gap-source-meta-item">42 pages</span>
        <span className="gap-source-meta-sep" aria-hidden="true">·</span>
        <span className="gap-source-meta-item">PDF · Notarized</span>
      </div>
      <div className="gap-source-fields">
        <div className="gap-source-field">
          <span className="gap-source-field-k">Relevant authority</span>
          <span className="gap-source-field-v">§7.2 Financial powers</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Scope</span>
          <span className="gap-source-field-v">Financial management, real property, financial accounts</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Knows</span>
          <span className="gap-source-field-v gap-source-field-knows">What authority exists</span>
        </div>
      </div>
      <div className="gap-source-excerpt" aria-hidden="true">
        <span className="gap-source-excerpt-rule" />
        <span className="gap-source-excerpt-text">
          "…the Agent is hereby authorized to exercise all powers with respect to financial
          accounts and real property as set forth in §7.2…"
        </span>
        <span className="gap-source-excerpt-fade" />
      </div>
    </div>
  );
}

// ── Corporate Resolution card ─────────────────────────────────────────────────
function CorpResCard() {
  return (
    <div className="gap-source gap-source-corp">
      <div className="gap-source-header">
        <span className="gap-source-type">Organizational authority</span>
      </div>
      <p className="gap-source-title">Corporate Resolution</p>
      <div className="gap-source-fields">
        <div className="gap-source-field">
          <span className="gap-source-field-k">Entity</span>
          <span className="gap-source-field-v">Northstar Holdings, Inc.</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Authorized signatories</span>
          <span className="gap-source-field-v">3 named</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Board approved</span>
          <span className="gap-source-field-v">April 2021</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Knows</span>
          <span className="gap-source-field-v gap-source-field-knows">Who the organization authorizes</span>
        </div>
      </div>
    </div>
  );
}

// ── Institutional Policy card ─────────────────────────────────────────────────
function PolicyCard() {
  return (
    <div className="gap-source gap-source-policy">
      <div className="gap-source-header">
        <span className="gap-source-type">Institutional policy</span>
        <span className="gap-source-badge gap-source-badge-muted">v19</span>
      </div>
      <p className="gap-source-title">Private Wealth Transfer Policy</p>
      <div className="gap-source-fields">
        <div className="gap-source-field">
          <span className="gap-source-field-k">Transaction threshold</span>
          <span className="gap-source-field-v">$250,000+</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Required conditions</span>
          <span className="gap-source-field-v">2 of 2</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Knows</span>
          <span className="gap-source-field-v gap-source-field-knows">Institutional conditions</span>
        </div>
      </div>
    </div>
  );
}

// ── Identity card ─────────────────────────────────────────────────────────────
function IdentityCard() {
  return (
    <div className="gap-source gap-source-identity">
      <div className="gap-source-header">
        <span className="gap-source-type">Identity directory</span>
        <span className="gap-source-badge gap-source-badge-green">Verified</span>
      </div>
      <p className="gap-source-title">Sarah Mitchell</p>
      <div className="gap-source-fields">
        <div className="gap-source-field">
          <span className="gap-source-field-k">Role</span>
          <span className="gap-source-field-v">Authorized representative</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Source</span>
          <span className="gap-source-field-v">User directory record</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Knows</span>
          <span className="gap-source-field-v gap-source-field-knows">Who the actor is</span>
        </div>
      </div>
    </div>
  );
}

// ── Request card ──────────────────────────────────────────────────────────────
function RequestCard() {
  return (
    <div className="gap-source gap-source-request">
      <div className="gap-source-header">
        <span className="gap-source-type">Transaction request</span>
      </div>
      <p className="gap-source-title">Wire transfer — $275,000</p>
      <div className="gap-source-fields">
        <div className="gap-source-field">
          <span className="gap-source-field-k">Resource</span>
          <span className="gap-source-field-v">Morrison Family Trust</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Account</span>
          <span className="gap-source-field-v gap-source-field-mono">••••8217</span>
        </div>
        <div className="gap-source-field">
          <span className="gap-source-field-k">Knows</span>
          <span className="gap-source-field-v gap-source-field-knows">What is being requested</span>
        </div>
      </div>
    </div>
  );
}

// ── Workflow card ─────────────────────────────────────────────────────────────
function WorkflowCard() {
  return (
    <div className="gap-source gap-source-workflow">
      <div className="gap-source-header">
        <span className="gap-source-type">Approval workflow</span>
        <span className="gap-source-badge gap-source-badge-pending">Pending</span>
      </div>
      <div className="gap-workflow-body">
        <div className="gap-workflow-left">
          <p className="gap-source-title">Transfer approval</p>
          <div className="gap-source-fields">
            <div className="gap-source-field">
              <span className="gap-source-field-k">Assigned to</span>
              <span className="gap-source-field-v">Private Wealth Operations</span>
            </div>
            <div className="gap-source-field">
              <span className="gap-source-field-k">Routing</span>
              <span className="gap-source-field-v">Escalation tier 2</span>
            </div>
          </div>
        </div>
        <div className="gap-workflow-note">
          <p className="gap-workflow-note-label">Knows</p>
          <p className="gap-workflow-note-text">Who currently reviews it — not whether the underlying authority is valid</p>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Gap() {
  const sectionRef = useRef(null);
  useReveal(sectionRef);

  return (
    <section id="auth-gap" className="gap-section" ref={sectionRef} aria-labelledby="gap-heading">
      <div className="gap-inner">

        {/* ── Part A: Headline + supporting copy ── */}
        <div className="gap-intro gap-reveal">
          <p className="gap-eyebrow">The authorization gap</p>
          <h2 id="gap-heading" className="gap-headline">
            Critical authority still lives in documents, systems, and institutional knowledge.
          </h2>
          <p className="gap-lead">
            Organizations can verify identity, manage access, and route approvals while the
            actual authority behind a consequential action remains buried across disconnected
            records and policies.
          </p>
        </div>

        {/* ── Part B: Fragmented source surfaces ── */}
        <div className="gap-sources gap-reveal gap-reveal-late" aria-label="Six disconnected authority sources">
          <div className="gap-sources-grid">
            <div className="gap-card-stagger" style={{ '--si': 0 }}><AuthDocCard /></div>
            <div className="gap-sources-right">
              <div className="gap-sources-right-top">
                <div className="gap-card-stagger" style={{ '--si': 1 }}><CorpResCard /></div>
                <div className="gap-card-stagger" style={{ '--si': 2 }}><PolicyCard /></div>
              </div>
              <div className="gap-sources-right-bottom">
                <div className="gap-card-stagger" style={{ '--si': 3 }}><IdentityCard /></div>
                <div className="gap-card-stagger" style={{ '--si': 4 }}><RequestCard /></div>
              </div>
            </div>
          </div>
          <div className="gap-card-stagger" style={{ '--si': 5 }}><WorkflowCard /></div>
          <div className="gap-no-model" aria-hidden="true">
            <span className="gap-no-model-rule" />
            <span className="gap-no-model-label">No shared authorization model</span>
            <span className="gap-no-model-rule" />
          </div>
        </div>

        {/* ── Part C: What systems know vs. what is missing ── */}
        <div className="gap-known gap-reveal">
          <p className="gap-known-intro">Your systems may know:</p>
          <div className="gap-known-grid">
            <div className="gap-known-item">
              <p className="gap-known-key">WHO</p>
              <p className="gap-known-desc">is acting</p>
              <p className="gap-known-sub">The authenticated actor's identity and directory record.</p>
            </div>
            <div className="gap-known-item">
              <p className="gap-known-key">WHAT</p>
              <p className="gap-known-desc">they are requesting</p>
              <p className="gap-known-sub">The specific action and transaction details submitted to the system.</p>
            </div>
            <div className="gap-known-item">
              <p className="gap-known-key">WHERE</p>
              <p className="gap-known-desc">the action will occur</p>
              <p className="gap-known-sub">The account, resource, or system involved in the transaction.</p>
            </div>
          </div>
          <div className="gap-missing">
            <p className="gap-missing-intro">But the missing question is:</p>
            <p className="gap-missing-question">
              <em>WHY</em> are they authorized?
            </p>
          </div>
        </div>

        {/* ── Part D: Final problem statement + Section 4 transition ── */}
        <div className="gap-close gap-reveal">
          <div className="gap-close-rule" aria-hidden="true" />
          <blockquote className="gap-close-statement">
            A document is not an enforceable authorization model.
          </blockquote>
          <p className="gap-close-body">
            Until authority, restrictions, policy, identity, and request context can be evaluated
            together, authorization remains dependent on fragmented records and human interpretation.
          </p>
          <p className="gap-transition-label" aria-label="Next: How FieldCore closes the gap">
            How FieldCore closes the gap
            <span aria-hidden="true"> ↓</span>
          </p>
        </div>

      </div>
    </section>
  );
}
