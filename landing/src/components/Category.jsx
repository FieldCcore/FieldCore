'use client';
import { Fragment, useEffect, useRef } from 'react';

// ── Scroll-reveal via IntersectionObserver ────────────────────────────────────
function useReveal(ref) {
  useEffect(() => {
    if (!ref.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const items = ref.current.querySelectorAll('.cat-reveal');

    if (reduced) {
      items.forEach(el => el.classList.add('cat-revealed'));
      return;
    }

    const io = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('cat-revealed');
          io.unobserve(entry.target);
        }
      }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    items.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ── Identity layer diagram ────────────────────────────────────────────────────
// SSO / MFA / IAM / Identity verification → ACTOR
function IdentityDiagram() {
  const systems = ['SSO', 'MFA', 'IAM', 'Identity verification'];
  return (
    <div className="cat-id-diagram">
      {/* Visible diagram — aria-hidden since semantic text is in surrounding copy */}
      <div className="cat-id-rail" aria-hidden="true">
        <div className="cat-id-inputs">
          {systems.map((s, i) => (
            <div key={s} className="cat-id-input cat-stagger" style={{ '--si': i }}>{s}</div>
          ))}
        </div>
        <div className="cat-id-funnel cat-conn-fade" style={{ '--ci': 0 }}>
          <div className="cat-id-funnel-line" />
          <span className="cat-id-funnel-tip">↓</span>
        </div>
        <div className="cat-id-actor-block cat-conn-fade" style={{ '--ci': 1 }}>
          <span className="cat-id-actor-label">ACTOR</span>
          <span className="cat-id-actor-sub">Authenticated identity</span>
        </div>
      </div>
    </div>
  );
}

// ── FieldCore authorization model diagram ─────────────────────────────────────
// ACTOR + ACTION + RESOURCE + AUTHORITY + CONDITIONS + POLICY → FIELDCORE → DECISION
const AUTH_INPUTS = [
  { key: 'ACTOR',      desc: 'Authenticated identity'   },
  { key: 'ACTION',     desc: 'What is being requested'  },
  { key: 'RESOURCE',   desc: 'What is being acted upon' },
  { key: 'AUTHORITY',  desc: 'Instrument of delegation' },
  { key: 'CONDITIONS', desc: 'Scope and limitations'    },
  { key: 'POLICY',     desc: 'Institutional rules'      },
];

function AuthModelDiagram() {
  return (
    <div className="cat-auth-diagram">
      {/* Screen-reader description */}
      <p className="cat-sr-only">
        FieldCore synthesizes six inputs — actor, action, resource, authority, conditions,
        and policy — to produce a decision.
      </p>

      <div className="cat-auth-inputs" aria-hidden="true">
        {AUTH_INPUTS.map(({ key, desc }, i) => (
          <div key={key} className="cat-auth-input cat-stagger" style={{ '--si': i }}>
            <span className="cat-auth-input-key">{key}</span>
            <span className="cat-auth-input-desc">{desc}</span>
          </div>
        ))}
      </div>

      <div className="cat-auth-connector cat-conn-fade" style={{ '--ci': 3 }} aria-hidden="true">
        <div className="cat-auth-connector-line" />
        <span className="cat-auth-connector-tip">↓</span>
      </div>

      <div className="cat-auth-fc cat-conn-fade" style={{ '--ci': 4 }} aria-hidden="true">
        <span className="cat-auth-fc-eyebrow">Authorization engine</span>
        <span className="cat-auth-fc-name">FIELDCORE</span>
      </div>

      <div className="cat-auth-connector cat-conn-fade" style={{ '--ci': 5 }} aria-hidden="true">
        <div className="cat-auth-connector-line" />
        <span className="cat-auth-connector-tip">↓</span>
      </div>

      <div className="cat-auth-decision cat-conn-fade" style={{ '--ci': 6 }} aria-hidden="true">
        DECISION
      </div>
    </div>
  );
}

// ── Identity → FieldCore → Execution pipeline ─────────────────────────────────
const PIPELINE_NODES = [
  {
    id: 'identity',
    label: 'Identity',
    sub: 'Establishes who someone is.',
  },
  {
    id: 'fieldcore',
    label: 'FieldCore authorization',
    sub: "Determines whether they're authorized to perform the action.",
    highlight: true,
  },
  {
    id: 'execution',
    label: 'Execution',
    sub: "The action is performed by the customer's existing system. FieldCore does not execute the transaction.",
  },
];

function Pipeline() {
  return (
    <div className="cat-pipeline">
      {PIPELINE_NODES.map((node, i) => (
        <Fragment key={node.id}>
          <div className={`cat-pnode${node.highlight ? ' cat-pnode-hl' : ''} cat-stagger`} style={{ '--si': i }}>
            <p className="cat-pnode-label">{node.label}</p>
            <p className="cat-pnode-sub">{node.sub}</p>
          </div>
          {i < PIPELINE_NODES.length - 1 && (
            <div className="cat-pipeline-sep" aria-hidden="true">→</div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Category() {
  const sectionRef = useRef(null);
  useReveal(sectionRef);

  return (
    <section id="deepdive" className="cat-section" ref={sectionRef} aria-labelledby="cat-heading">
      <div className="cat-inner">

        {/* ── Part A: Identity statement (left) + identity diagram (right) ── */}
        <div className="cat-row">
          <div className="cat-col cat-reveal">
            <p className="cat-eyebrow">The authorization layer</p>
            <h2 id="cat-heading" className="cat-statement">
              Identity tells you who someone is.
            </h2>
            <p className="cat-body">
              Authentication and identity systems establish who a person is and what systems
              they can access.
            </p>
          </div>
          <div className="cat-col cat-reveal cat-reveal-late">
            <IdentityDiagram />
          </div>
        </div>

        <div className="cat-divider" aria-hidden="true" />

        {/* ── Part B: FieldCore diagram (left) + FieldCore statement (right) ── */}
        <div className="cat-row cat-row-flip">
          <div className="cat-col cat-reveal cat-reveal-late">
            <AuthModelDiagram />
          </div>
          <div className="cat-col cat-reveal">
            <h3 className="cat-statement">
              FieldCore determines whether they're authorized to perform the action.
            </h3>
            <p className="cat-body">
              FieldCore evaluates whether that actor has authority to perform a specific action
              against a specific resource under verified authority and institutional policy.
            </p>
          </div>
        </div>

        {/* ── Part C: Identity → FieldCore Authorization → Execution ── */}
        <div className="cat-pipeline-wrap cat-reveal">
          <Pipeline />
        </div>

        {/* ── Part D: Positioning copy ── */}
        <div className="cat-position cat-reveal">
          <p className="cat-position-claim">
            FieldCore does not replace identity systems. It answers the authorization question
            they do not.
          </p>
          <div className="cat-questions">
            <div className="cat-question">
              <p className="cat-q-source">Identity layer</p>
              <p className="cat-q-text">Who is this actor?</p>
            </div>
            <div className="cat-q-sep" aria-hidden="true">≠</div>
            <div className="cat-question">
              <p className="cat-q-source">FieldCore</p>
              <p className="cat-q-text">Is this actor authorized to perform this action?</p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
