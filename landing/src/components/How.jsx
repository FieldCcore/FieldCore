'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

// ── Step definitions ──────────────────────────────────────────────────────────
const STEPS = [
  { num: '01', id: 'intake',       title: 'Intake',       tagline: 'Bring the authority evidence into one controlled process.' },
  { num: '02', id: 'extract',      title: 'Extract',      tagline: 'AI structures candidate information from the evidence.' },
  { num: '03', id: 'verify',       title: 'Verify',       tagline: 'Your institution establishes the verified record.' },
  { num: '04', id: 'canonicalize', title: 'Canonicalize', tagline: 'Turn verified authority into structured data your systems can evaluate.' },
  { num: '05', id: 'evaluate',     title: 'Evaluate',     tagline: 'Evaluate the request against verified authority and institutional policy.' },
  { num: '06', id: 'prove',        title: 'Prove',        tagline: 'Every decision leaves an evidence trail.' },
];

// ── Step 01 — Intake ──────────────────────────────────────────────────────────
function IntakeVisual() {
  return (
    <div className="how-card">
      <div className="how-card-head">
        <span className="how-card-label">Authority case</span>
        <span className="how-card-id">FC-394201</span>
        <span className="how-card-tag">Intake</span>
      </div>
      <div className="how-card-body">
        <div className="how-doc">
          <div className="how-doc-icon" aria-hidden="true">
            <span className="how-doc-icon-ext">PDF</span>
          </div>
          <div className="how-doc-info">
            <p className="how-doc-name">Durable Power of Attorney.pdf</p>
            <p className="how-doc-meta">42 pages · Submitted Mar 12, 2025 · 14:03 UTC</p>
          </div>
        </div>

        <div className="how-intake-fields">
          <div className="how-field">
            <span className="how-field-k">Principal</span>
            <span className="how-field-v">Robert Morrison</span>
          </div>
          <div className="how-field">
            <span className="how-field-k">Related request</span>
            <span className="how-field-v">$275,000 wire transfer</span>
          </div>
          <div className="how-field">
            <span className="how-field-k">Case reference</span>
            <span className="how-field-v how-field-mono">FC-394201</span>
          </div>
        </div>

        <div className="how-notice how-notice-evidence" role="note">
          <span className="how-notice-icon" aria-hidden="true">⚠</span>
          <p>The document is evidence. It is not yet a verified authority record.</p>
        </div>
      </div>
    </div>
  );
}

// ── Step 02 — Extract ─────────────────────────────────────────────────────────
const CANDIDATES = [
  { field: 'Instrument type', proposed: 'Durable power of attorney', confidence: 97, status: 'accepted', ev: 'Page 1 · §1.1'  },
  { field: 'Principal name',  proposed: 'Robert Morrison',           confidence: 95, status: 'accepted', ev: 'Page 3 · §2.1'  },
  { field: 'Agent name',      proposed: 'Sarah Mitchell',            confidence: 91, status: 'accepted', ev: 'Page 4 · §2.3'  },
  { field: 'Effective date',  proposed: 'March 12, 2025',            confidence: 88, status: 'accepted', ev: 'Page 2 · §1.4'  },
  { field: 'Monetary limit',  proposed: '$300,000',                  confidence: 84, status: 'pending',  ev: 'Page 18 · §7.2' },
];

function ExtractVisual() {
  return (
    <div className="how-card">
      <div className="how-card-head">
        <span className="how-card-label">Candidate extraction</span>
        <span className="how-card-badge how-card-badge-pending">Not yet verified</span>
      </div>
      <div className="how-card-body">
        <div className="how-extract-source">
          <span className="how-extract-source-name">Durable Power of Attorney.pdf</span>
          <div className="how-extract-ev">
            <span className="how-extract-ev-label">Primary evidence reference</span>
            <span className="how-extract-ev-value">Page 18 · §7.2 Financial powers</span>
          </div>
        </div>

        <div className="how-candidates" aria-label="Extracted candidate fields">
          {CANDIDATES.map((c, i) => (
            <div key={c.field} className={`how-candidate how-candidate--${c.status}`} style={{ '--ci': i }}>
              <div className="how-candidate-field">{c.field}</div>
              <div className="how-candidate-proposed">{c.proposed}</div>
              <div className="how-candidate-meta">
                <span className="how-candidate-conf">{c.confidence}%</span>
                <span className="how-candidate-ev">{c.ev}</span>
                <span className={`how-candidate-status how-candidate-status--${c.status}`}>
                  {c.status === 'accepted' ? 'Accepted' : 'Pending review'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="how-extract-footer">
          AI proposed — candidates require human review before any authority record is updated.
        </p>
      </div>
    </div>
  );
}

// ── Step 03 — Verify ──────────────────────────────────────────────────────────
function VerifyVisual() {
  return (
    <div className="how-card">
      <div className="how-card-head">
        <span className="how-card-label">Review workspace</span>
        <span className="how-card-reviewer">Alex Rivera</span>
      </div>
      <div className="how-card-body">
        <div className="how-verify-candidate">
          <div className="how-field">
            <span className="how-field-k">Candidate field</span>
            <span className="how-field-v">Agent name</span>
          </div>
          <div className="how-field">
            <span className="how-field-k">Proposed value</span>
            <span className="how-field-v">Sarah Mitchell</span>
          </div>
          <div className="how-field">
            <span className="how-field-k">Evidence</span>
            <span className="how-field-v how-field-mono">Page 4 · §2.3 Delegation of authority</span>
          </div>
          <div className="how-field">
            <span className="how-field-k">Confidence</span>
            <span className="how-field-v how-field-mono">91%</span>
          </div>

          <div className="how-verify-actions" aria-label="Review actions (illustrative)">
            <span className="how-btn how-btn-accepted" aria-label="Accepted">
              ✓ Accepted
            </span>
            <span className="how-btn how-btn-reject" aria-label="Reject (not taken)">
              Reject
            </span>
          </div>
          <p className="how-verify-outcome">
            <span className="how-verify-check" aria-hidden="true">✓ </span>
            Accepted by Alex Rivera · Mar 12, 2025
          </p>
        </div>

        <div className="how-notice how-notice-human" role="note">
          <p className="how-notice-lead">AI proposed. Your institution verifies.</p>
          <p className="how-notice-sub">
            AI-generated candidates remain separate from canonical authority until accepted
            through the institution's authorized review process.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Step 04 — Canonicalize ────────────────────────────────────────────────────
function CanonicalizeVisual() {
  return (
    <div className="how-card">
      <div className="how-card-head">
        <span className="how-card-label">Authority instrument</span>
        <span className="how-card-badge how-card-badge-verified">Verified</span>
      </div>
      <div className="how-card-body">
        <div className="how-record-grid">
          <div>
            <div className="how-field how-rec-field" style={{ '--fi': 0 }}>
              <span className="how-field-k">Instrument type</span>
              <span className="how-field-v">Durable power of attorney</span>
            </div>
            <div className="how-field how-rec-field" style={{ '--fi': 1 }}>
              <span className="how-field-k">Principal</span>
              <span className="how-field-v">Robert Morrison</span>
            </div>
            <div className="how-field how-rec-field" style={{ '--fi': 2 }}>
              <span className="how-field-k">Agent</span>
              <span className="how-field-v">Sarah Mitchell</span>
            </div>
            <div className="how-field how-rec-field" style={{ '--fi': 3 }}>
              <span className="how-field-k">Role</span>
              <span className="how-field-v">Authorized representative</span>
            </div>
          </div>
          <div>
            <div className="how-field how-rec-field" style={{ '--fi': 4 }}>
              <span className="how-field-k">Effective</span>
              <span className="how-field-v">March 12, 2025</span>
            </div>
            <div className="how-field how-rec-field" style={{ '--fi': 5 }}>
              <span className="how-field-k">Monetary limit</span>
              <span className="how-field-v how-field-mono">$300,000</span>
            </div>
            <div className="how-field how-rec-field" style={{ '--fi': 6 }}>
              <span className="how-field-k">Evidence</span>
              <span className="how-field-v how-field-ev">POA §7.2 · §9.1</span>
            </div>
            <div className="how-field how-rec-field" style={{ '--fi': 7 }}>
              <span className="how-field-k">Status</span>
              <span className="how-field-v how-field-verified">Verified</span>
            </div>
          </div>
        </div>
        <p className="how-record-note" aria-hidden="true">
          Unstructured document → candidate extraction → institutional review → verified instrument
        </p>
      </div>
    </div>
  );
}

// ── Step 05 — Evaluate ────────────────────────────────────────────────────────
function EvaluateVisual() {
  return (
    <div className="how-card">
      <div className="how-card-head">
        <span className="how-card-label">Evaluation</span>
        <span className="how-card-id">FC-394201</span>
      </div>
      <div className="how-card-body">
        <div className="how-eval-inputs">
          <div className="how-eval-row" style={{ '--ri': 0 }}>
            <span className="how-eval-key">Actor</span>
            <span className="how-eval-val">Sarah Mitchell</span>
            <span className="how-eval-sub">Authorized representative</span>
          </div>
          <div className="how-eval-row" style={{ '--ri': 1 }}>
            <span className="how-eval-key">Action</span>
            <span className="how-eval-val how-field-mono">BANKING.WIRE_TRANSFER</span>
            <span className="how-eval-sub">$275,000 · Morrison Family Trust</span>
          </div>
          <div className="how-eval-row" style={{ '--ri': 2 }}>
            <span className="how-eval-key">Authority</span>
            <span className="how-eval-val">Durable Power of Attorney</span>
            <span className="how-eval-sub how-field-mono">Version 03 · Verified</span>
          </div>
          <div className="how-eval-row" style={{ '--ri': 3 }}>
            <span className="how-eval-key">Policy</span>
            <span className="how-eval-val">Private Wealth Transfer Policy</span>
            <span className="how-eval-sub how-field-mono">Version 14.2</span>
          </div>
        </div>

        <div className="how-eval-engine" aria-label="FieldCore deterministic evaluation engine">
          <span className="how-eval-engine-rule" aria-hidden="true" />
          <span className="how-eval-engine-label">FieldCore evaluation engine</span>
          <span className="how-eval-engine-rule" aria-hidden="true" />
        </div>

        <div className="how-eval-decision">
          <span className="how-decision-badge">Review required</span>
          <p className="how-decision-reason">
            Authority evidence is present, but the delegate role cannot be resolved
            deterministically under the current institutional policy.
          </p>
        </div>

        <p className="how-eval-note">
          Verified authority enters deterministic evaluation. AI does not make the runtime
          authorization decision.
        </p>
      </div>
    </div>
  );
}

// ── Step 06 — Prove ───────────────────────────────────────────────────────────
function ProveVisual() {
  return (
    <div className="how-card">
      <div className="how-card-head">
        <span className="how-card-label">Decision record</span>
        <span className="how-card-id">FC-D-938293</span>
      </div>
      <div className="how-card-body">
        <div className="how-prove-outcome how-prove-field" style={{ '--pi': 0 }}>
          <span className="how-decision-badge">Review required</span>
        </div>
        <div className="how-field how-prove-field" style={{ '--pi': 1 }}>
          <span className="how-field-k">Request ID</span>
          <span className="how-field-v how-field-mono">FC-394201</span>
        </div>
        <div className="how-field how-prove-field" style={{ '--pi': 2 }}>
          <span className="how-field-k">Authority</span>
          <span className="how-field-v">Durable Power of Attorney · Version 03</span>
        </div>
        <div className="how-field how-prove-field" style={{ '--pi': 3 }}>
          <span className="how-field-k">Policy</span>
          <span className="how-field-v">Private Wealth Transfer Policy · Version 14.2</span>
        </div>
        <div className="how-field how-prove-field" style={{ '--pi': 4 }}>
          <span className="how-field-k">Evidence</span>
          <span className="how-field-v how-field-ev">POA §7.2</span>
        </div>
        <div className="how-field how-prove-field" style={{ '--pi': 5 }}>
          <span className="how-field-k">Evaluated</span>
          <span className="how-field-v how-field-mono">Mar 12, 2025 · 14:23:07 UTC</span>
        </div>
        <div className="how-field how-field-reason how-prove-field" style={{ '--pi': 6 }}>
          <span className="how-field-k">Reason</span>
          <span className="how-field-v">
            Authority evidence is present, but the delegate role cannot be resolved
            deterministically under the current institutional policy.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Visual map — component references so isActive prop can be passed ──────────
const VISUAL_COMPONENTS = {
  intake:       IntakeVisual,
  extract:      ExtractVisual,
  verify:       VerifyVisual,
  canonicalize: CanonicalizeVisual,
  evaluate:     EvaluateVisual,
  prove:        ProveVisual,
};

// ── Main export ───────────────────────────────────────────────────────────────
export default function How() {
  const stepsRef  = useRef(null);
  const introRef  = useRef(null);
  const [activeStep, setActiveStep] = useState('intake');
  const [activatedSteps, setActivatedSteps] = useState(() => new Set());

  // Scroll-reveal for section intro
  useEffect(() => {
    if (!introRef.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      introRef.current.classList.add('how-revealed');
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { e.target.classList.add('how-revealed'); io.disconnect(); } },
      { threshold: 0.1 }
    );
    io.observe(introRef.current);
    return () => io.disconnect();
  }, []);

  // Step nav tracking
  useEffect(() => {
    if (!stepsRef.current) return;
    const visible = new Set();
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          const id = e.target.dataset.stepId;
          if (e.isIntersecting) {
            visible.add(id);
            setActivatedSteps(prev => {
              if (prev.has(id)) return prev;
              const next = new Set(prev);
              next.add(id);
              return next;
            });
          } else visible.delete(id);
        });
        const first = STEPS.find(s => visible.has(s.id));
        if (first) setActiveStep(first.id);
      },
      { rootMargin: '-60px 0px -50% 0px', threshold: 0 }
    );
    stepsRef.current.querySelectorAll('[data-step-id]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  function scrollToStep(id) {
    const el = document.getElementById(`how-step-${id}`);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  return (
    <section id="how-it-works" className="how-section" aria-labelledby="how-heading">
      <div className="how-inner">

        {/* ── Intro ── */}
        <div className="how-intro how-reveal" ref={introRef}>
          <p className="how-eyebrow">How FieldCore works</p>
          <h2 id="how-heading" className="how-headline">
            From authority evidence to an explainable decision.
          </h2>
          <p className="how-lead">
            FieldCore separates extraction, human verification, structured authority, and
            deterministic evaluation so evidence does not become authority without
            institutional control.
          </p>
        </div>

        {/* ── Two-column layout ── */}
        <div className="how-layout">

          {/* Left: sticky step nav */}
          <nav className="how-nav" aria-label="Workflow steps">
            <ol className="how-nav-list">
              {STEPS.map(s => (
                <li key={s.id} className={`how-nav-item${activeStep === s.id ? ' how-nav-item--active' : ''}`}>
                  <button
                    className="how-nav-btn"
                    onClick={() => scrollToStep(s.id)}
                    aria-current={activeStep === s.id ? 'step' : undefined}
                    aria-label={`Go to step ${s.num}: ${s.title}`}
                  >
                    <span className="how-nav-num">{s.num}</span>
                    <span className="how-nav-title">{s.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {/* Right: step panels */}
          <div className="how-steps" ref={stepsRef}>
            {STEPS.map(s => {
              const VC = VISUAL_COMPONENTS[s.id];
              const wasActive = activatedSteps.has(s.id);
              return (
                <div
                  key={s.id}
                  id={`how-step-${s.id}`}
                  className="how-step"
                  data-step-id={s.id}
                >
                  <div className="how-step-header">
                    <span className="how-step-num" aria-hidden="true">{s.num}</span>
                    <h3 className="how-step-title">{s.title}</h3>
                    <p className="how-step-tagline">{s.tagline}</p>
                  </div>
                  <div className={`how-step-visual${wasActive ? ' how-step-was-active' : ''}`}>
                    <VC isActive={wasActive} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Section boundary ── */}
        <div className="how-close">
          <div className="how-close-rule" aria-hidden="true" />
          <p className="how-close-label">
            One controlled path from evidence to decision.
          </p>
        </div>

      </div>
    </section>
  );
}
