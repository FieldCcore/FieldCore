'use client';
import { useEffect, useRef, useState } from 'react';

const AI_CANDIDATES = [
  { field: 'instrument_type', value: 'Durable power of attorney', conf: '97%' },
  { field: 'principal_name',  value: 'Robert Morrison',           conf: '95%' },
  { field: 'agent_name',      value: 'Sarah Mitchell',            conf: '91%' },
  { field: 'effective_date',  value: 'March 12, 2025',            conf: '88%' },
  { field: 'monetary_limit',  value: '$300,000',                  conf: '84%' },
];

const VERIFIED_FIELDS = [
  { key: 'instrument_type', value: 'Durable power of attorney' },
  { key: 'principal_name',  value: 'Robert Morrison'           },
  { key: 'agent_name',      value: 'Sarah Mitchell'            },
  { key: 'monetary_limit',  value: '$300,000'                  },
];

const EVAL_INPUTS = [
  { key: 'ACTOR',     value: 'Sarah Mitchell · Authorized representative' },
  { key: 'AUTHORITY', value: 'Durable Power of Attorney · Version 03'    },
  { key: 'POLICY',    value: 'Private Wealth Transfer Policy · v14.2'    },
  { key: 'ACTION',    value: 'BANKING.WIRE_TRANSFER · $275,000'          },
];

export default function Layers() {
  const sectionRef = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!sectionRef.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setActive(true); return; }

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) { setActive(true); io.disconnect(); }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(sectionRef.current);
    return () => io.disconnect();
  }, []);

  return (
    <section
      id="layers"
      className={`ly-section${active ? ' ly-active' : ''}`}
      ref={sectionRef}
      aria-labelledby="ly-heading"
    >
      <div className="ly-inner">

        {/* ── Intro ── */}
        <div className="ly-intro">
          <p className="ly-eyebrow">The architecture</p>
          <h2 id="ly-heading" className="ly-headline">
            AI reads. Humans verify. Rules decide.
          </h2>
          <p className="ly-lead">
            FieldCore keeps three things permanently separate: what AI proposes,
            what your institution confirms, and what rules produce as a decision.
            Evidence does not become authority until a human accepts it.
            Authority does not become a decision until the engine evaluates it.
          </p>
        </div>

        {/* ── Flow ── */}
        <div className="ly-flow" aria-label="Three-layer authorization architecture">

          {/* 1 — Source evidence */}
          <div className="ly-flow-item">
            <div className="ly-source" aria-label="Source evidence input">
              <span className="ly-source-dot" aria-hidden="true" />
              SOURCE EVIDENCE · Durable Power of Attorney.pdf
            </div>
          </div>

          {/* 2 — Connector */}
          <div className="ly-connector ly-connector--short ly-flow-item" aria-hidden="true" />

          {/* 3 — Layer 1: AI Extraction */}
          <div className="ly-flow-item">
            <div className="ly-layer" aria-label="Layer 1: AI extraction">
              <div className="ly-layer-head">
                <span className="ly-layer-eyebrow">Layer 1</span>
                <span className="ly-layer-title">AI Extraction</span>
                <span className="ly-layer-badge ly-badge-ai">AI reads</span>
              </div>
              <div className="ly-layer-body">
                <p className="ly-layer-desc">
                  AI reads the unstructured document and proposes structured candidate values.
                  These are proposals only — unverified output, not authority.
                </p>
                <div className="ly-candidates" aria-label="AI-proposed candidates">
                  {AI_CANDIDATES.map(c => (
                    <div key={c.field} className="ly-candidate">
                      <span className="ly-cand-field">{c.field}</span>
                      <span className="ly-cand-value">{c.value}</span>
                      <span className="ly-cand-conf">{c.conf}</span>
                    </div>
                  ))}
                </div>
                <div className="ly-layer-notice" role="note">
                  <span className="ly-notice-icon" aria-hidden="true">⚠</span>
                  Unverified candidates — not institutional authority
                </div>
              </div>
            </div>
          </div>

          {/* 4 — Connector to boundary */}
          <div className="ly-connector ly-connector--boundary ly-flow-item" aria-hidden="true" />

          {/* 5 — Verification boundary */}
          <div className="ly-flow-item">
            <div className="ly-boundary" role="separator" aria-label="Institutional verification boundary">
              <p className="ly-boundary-label">Institutional Verification Boundary</p>
              <p className="ly-boundary-text">
                AI output does not become authority until your institution accepts it.
                Candidates remain separate from canonical records until an authorized
                reviewer confirms each field.
              </p>
            </div>
          </div>

          {/* 6 — Connector */}
          <div className="ly-connector ly-connector--boundary ly-flow-item" aria-hidden="true" />

          {/* 7 — Layer 2: Institutional Verification */}
          <div className="ly-flow-item">
            <div className="ly-layer" aria-label="Layer 2: Institutional verification">
              <div className="ly-layer-head">
                <span className="ly-layer-eyebrow">Layer 2</span>
                <span className="ly-layer-title">Institutional Verification</span>
                <span className="ly-layer-badge ly-badge-human">Humans verify</span>
              </div>
              <div className="ly-layer-body">
                <p className="ly-layer-desc">
                  Your authorized reviewers confirm each candidate against the
                  source document. The verified record is produced by your institution,
                  not by AI.
                </p>
                <div className="ly-verified-fields" aria-label="Reviewer-confirmed fields">
                  {VERIFIED_FIELDS.map(f => (
                    <div key={f.key} className="ly-verified-field">
                      <span className="ly-check" aria-label="Accepted">✓</span>
                      <span className="ly-vf-key">{f.key}</span>
                      <span className="ly-vf-val">{f.value}</span>
                    </div>
                  ))}
                </div>
                <p className="ly-layer-verified-note">
                  → Verified canonical authority record
                </p>
              </div>
            </div>
          </div>

          {/* 8 — Connector */}
          <div className="ly-connector ly-connector--long ly-flow-item" aria-hidden="true" />

          {/* 9 — Layer 3: Deterministic Evaluation */}
          <div className="ly-flow-item">
            <div className="ly-layer" aria-label="Layer 3: Deterministic evaluation">
              <div className="ly-layer-head">
                <span className="ly-layer-eyebrow">Layer 3</span>
                <span className="ly-layer-title">Deterministic Evaluation</span>
                <span className="ly-layer-badge ly-badge-engine">Rules decide</span>
              </div>
              <div className="ly-layer-body">
                <p className="ly-layer-desc">
                  Verified authority enters evaluation. No AI involvement in the
                  runtime decision. The engine applies institutional policy to
                  produce a deterministic, explainable outcome.
                </p>
                <div className="ly-eval-inputs" aria-label="Evaluation inputs">
                  {EVAL_INPUTS.map(r => (
                    <div key={r.key} className="ly-eval-row">
                      <span className="ly-eval-key">{r.key}</span>
                      <span className="ly-eval-val">{r.value}</span>
                    </div>
                  ))}
                </div>
                <div className="ly-eval-sep" aria-hidden="true">
                  <span className="ly-eval-sep-line" />
                  <span className="ly-eval-sep-label">FieldCore evaluation engine</span>
                  <span className="ly-eval-sep-line" />
                </div>
                <div className="ly-failsafe" role="note">
                  <p className="ly-failsafe-label">Fail-safe behavior</p>
                  <p className="ly-failsafe-text">
                    When a delegate role cannot be resolved deterministically under
                    institutional policy, the engine returns MANUAL_REVIEW — not a
                    guess. FieldCore does not invent authority when evidence or rules
                    are incomplete.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 10 — Connector */}
          <div className="ly-connector ly-connector--short ly-flow-item" aria-hidden="true" />

          {/* 11 — Decision */}
          <div className="ly-flow-item">
            <div className="ly-decision" aria-label="Authorization decision output">
              <div className="ly-decision-inner">
                <span className="ly-decision-dot" aria-hidden="true" />
                <span className="ly-decision-text">Review required</span>
              </div>
              <span className="ly-decision-note">MANUAL_REVIEW · explainable · audit-ready</span>
            </div>
          </div>

        </div>{/* end ly-flow */}

        {/* ── Close ── */}
        <div className="ly-close">
          <div className="ly-close-rule" aria-hidden="true" />
          <p className="ly-close-label">
            Evidence does not become authority without institutional control.
          </p>
        </div>

      </div>
    </section>
  );
}
