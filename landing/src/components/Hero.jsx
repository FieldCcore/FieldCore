'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Scenario data ─────────────────────────────────────────────────────────
// Authority Engine semantics (production): agentRoles is empty for all instrument
// types. AUTHORIZED is unreachable. Every delegate role → UNDEFINED_ROLE_SEMANTICS
// → MANUAL_REVIEW. All four scenarios correctly show "Review required."

const SCENARIOS = {
  banking: {
    id: 'banking',
    label: 'Banking',
    request: 'Sarah Mitchell is requesting authority to initiate a $275,000 wire from the Morrison Family Trust.',
    fields: [
      { key: 'requestId',        label: 'Request ID',           value: 'FC-394201',                              mono: true  },
      { key: 'actor',            label: 'Actor',                value: 'Sarah Mitchell'                                      },
      { key: 'role',             label: 'Role',                 value: 'Authorized representative'                           },
      { key: 'action',           label: 'Requested action',     value: 'Initiate wire transfer'                              },
      { key: 'resource',         label: 'Resource',             value: 'Morrison Family Trust'                               },
      { key: 'resourceId',       label: 'Resource identifier',  value: 'Account ····8217', mono: true  },
      { key: 'amount',           label: 'Requested amount',     value: '$275,000',                               mono: true  },
      { key: 'authority',        label: 'Authority',            value: 'Durable Power of Attorney'                           },
      { key: 'authorityVersion', label: 'Authority version',    value: 'Version 03',                             mono: true  },
      { key: 'policy',           label: 'Policy',               value: 'Private Wealth Transfer Policy'                      },
      { key: 'policyVersion',    label: 'Policy version',       value: 'Version 14.2',                           mono: true  },
      { key: 'evidence',         label: 'Evidence',             value: 'POA §7.2',                         mono: true  },
    ],
    trace: [
      { label: 'Identity established',          value: 'Sarah Mitchell',                              status: 'ok'     },
      { label: 'Authority instrument located',  value: 'Durable Power of Attorney',                  status: 'ok'     },
      { label: 'Actor relationship identified', value: 'Authorized representative',                  status: 'ok'     },
      { label: 'Resource matched',              value: 'Morrison Family Trust',                      status: 'ok'     },
      { label: 'Requested action identified',   value: 'Wire transfer',                              status: 'ok'     },
      { label: 'Policy evaluated',              value: 'Role cannot be resolved deterministically',  status: 'review' },
    ],
    decision: 'Review required',
    decisionReason: 'Authority evidence is present, but the delegate role cannot be resolved deterministically under the current institutional policy.',
    decisionTags: ['Evidence: POA §7.2', 'Authority: Version 03', 'Policy: Version 14.2'],
    evidencePanel: [
      { key: 'Evidence source',    value: 'Durable Power of Attorney'                                                    },
      { key: 'Reference',          value: '§7.2'                                                                     },
      { key: 'Relevant authority', value: 'Financial management — real property, financial accounts, and investment decisions on behalf of the principal' },
      { key: 'Policy applied',     value: 'Private Wealth Transfer Policy v14.2'                                         },
    ],
    authorityPanel: [
      { key: 'Instrument type', value: 'Durable Power of Attorney' },
      { key: 'Version',         value: '03'                         },
      { key: 'Principal',       value: 'Morrison Family Trust'      },
      { key: 'Agent',           value: 'Sarah Mitchell'             },
      { key: 'Status',          value: 'Verified'                   },
      { key: 'Effective',       value: '2024-03-01'                 },
    ],
  },
  trust: {
    id: 'trust',
    label: 'Trust & Wealth',
    request: 'James Harrington is requesting authority to distribute $42,000 from the Blackwell Family Trust to designated beneficiaries.',
    fields: [
      { key: 'requestId',        label: 'Request ID',           value: 'FC-481092',                              mono: true  },
      { key: 'actor',            label: 'Actor',                value: 'James Harrington'                                    },
      { key: 'role',             label: 'Role',                 value: 'Co-trustee'                                          },
      { key: 'action',           label: 'Requested action',     value: 'Trust distribution'                                  },
      { key: 'resource',         label: 'Resource',             value: 'Blackwell Family Trust'                              },
      { key: 'resourceId',       label: 'Trust identifier',     value: 'Trust ····3941',    mono: true  },
      { key: 'amount',           label: 'Distribution amount',  value: '$42,000',                                mono: true  },
      { key: 'authority',        label: 'Authority',            value: 'Irrevocable Family Trust Agreement'                  },
      { key: 'authorityVersion', label: 'Authority version',    value: 'Version 02',                             mono: true  },
      { key: 'policy',           label: 'Policy',               value: 'Trust Distribution Policy'                           },
      { key: 'policyVersion',    label: 'Policy version',       value: 'Version 7.4',                            mono: true  },
      { key: 'evidence',         label: 'Evidence',             value: 'Trust Agreement §5.3',              mono: true  },
    ],
    trace: [
      { label: 'Identity established',          value: 'James Harrington',                               status: 'ok'     },
      { label: 'Authority instrument located',  value: 'Irrevocable Family Trust Agreement',             status: 'ok'     },
      { label: 'Actor relationship identified', value: 'Co-trustee',                                     status: 'ok'     },
      { label: 'Resource matched',              value: 'Blackwell Family Trust',                         status: 'ok'     },
      { label: 'Requested action identified',   value: 'Trust distribution',                             status: 'ok'     },
      { label: 'Policy evaluated',              value: 'Co-trustee activation requires external verification', status: 'review' },
    ],
    decision: 'Review required',
    decisionReason: 'The co-trustee role requires external verification of activation state under the current institutional policy.',
    decisionTags: ['Evidence: §5.3', 'Authority: Version 02', 'Policy: Version 7.4'],
    evidencePanel: [
      { key: 'Evidence source',    value: 'Irrevocable Family Trust Agreement'                                              },
      { key: 'Reference',          value: '§5.3'                                                                       },
      { key: 'Relevant authority', value: 'Distribution authority to designated beneficiaries upon co-trustee consent'     },
      { key: 'Policy applied',     value: 'Trust Distribution Policy v7.4'                                                 },
    ],
    authorityPanel: [
      { key: 'Instrument type', value: 'Irrevocable Family Trust Agreement' },
      { key: 'Version',         value: '02'                                  },
      { key: 'Principal',       value: 'Blackwell Family Trust'              },
      { key: 'Agent',           value: 'James Harrington'                    },
      { key: 'Status',          value: 'Verified'                            },
      { key: 'Established',     value: '2019-11-14'                          },
    ],
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    request: 'Rachel Okonkwo is requesting authority to execute a $1.8M procurement contract on behalf of Meridian Capital Group.',
    fields: [
      { key: 'requestId',        label: 'Request ID',        value: 'FC-529347',                              mono: true  },
      { key: 'actor',            label: 'Actor',             value: 'Rachel Okonkwo'                                      },
      { key: 'role',             label: 'Role',              value: 'Authorized representative'                           },
      { key: 'action',           label: 'Requested action',  value: 'Execute procurement contract'                        },
      { key: 'resource',         label: 'Resource',          value: 'Meridian Capital Group'                              },
      { key: 'resourceId',       label: 'Entity identifier', value: 'Entity ····7712',   mono: true  },
      { key: 'amount',           label: 'Contract value',    value: '$1,800,000',                             mono: true  },
      { key: 'authority',        label: 'Authority',         value: 'Corporate Authorization Resolution'                  },
      { key: 'authorityVersion', label: 'Authority version', value: 'Version 01',                             mono: true  },
      { key: 'policy',           label: 'Policy',            value: 'Enterprise Procurement Policy'                       },
      { key: 'policyVersion',    label: 'Policy version',    value: 'Version 22.1',                           mono: true  },
      { key: 'evidence',         label: 'Evidence',          value: 'Resolution §3.1',                   mono: true  },
    ],
    trace: [
      { label: 'Identity established',          value: 'Rachel Okonkwo',                            status: 'ok'     },
      { label: 'Authority instrument located',  value: 'Corporate Authorization Resolution',        status: 'ok'     },
      { label: 'Actor relationship identified', value: 'Authorized representative',                status: 'ok'     },
      { label: 'Resource matched',              value: 'Meridian Capital Group',                   status: 'ok'     },
      { label: 'Requested action identified',   value: 'Procurement contract execution',           status: 'ok'     },
      { label: 'Policy evaluated',              value: 'Role cannot be resolved deterministically', status: 'review' },
    ],
    decision: 'Review required',
    decisionReason: 'Authority evidence is present, but the delegate role cannot be resolved deterministically under the current institutional policy.',
    decisionTags: ['Evidence: §3.1', 'Authority: Version 01', 'Policy: Version 22.1'],
    evidencePanel: [
      { key: 'Evidence source',    value: 'Corporate Authorization Resolution'                                             },
      { key: 'Reference',          value: '§3.1'                                                                      },
      { key: 'Relevant authority', value: 'Authorized representative for procurement and contractual obligations'          },
      { key: 'Policy applied',     value: 'Enterprise Procurement Policy v22.1'                                           },
    ],
    authorityPanel: [
      { key: 'Instrument type',  value: 'Corporate Authorization Resolution'        },
      { key: 'Version',          value: '01'                                         },
      { key: 'Principal',        value: 'Meridian Capital Group'                     },
      { key: 'Agent',            value: 'Rachel Okonkwo'                             },
      { key: 'Status',           value: 'Verified'                                   },
      { key: 'Authorized scope', value: 'Procurement and operational contracts'      },
    ],
  },
  healthcare: {
    id: 'healthcare',
    label: 'Healthcare',
    request: 'David Sato is requesting authority to consent to a surgical procedure on behalf of Eleanor Sato.',
    fields: [
      { key: 'requestId',        label: 'Request ID',         value: 'FC-607114',                              mono: true  },
      { key: 'actor',            label: 'Actor',              value: 'David Sato'                                          },
      { key: 'role',             label: 'Role',               value: 'Healthcare proxy agent'                              },
      { key: 'action',           label: 'Requested action',   value: 'Surgical consent'                                    },
      { key: 'resource',         label: 'Patient',            value: 'Eleanor Sato'                                        },
      { key: 'resourceId',       label: 'Patient identifier', value: 'Patient ····6694',  mono: true  },
      { key: 'authority',        label: 'Authority',          value: 'Healthcare Proxy Directive'                          },
      { key: 'authorityVersion', label: 'Authority version',  value: 'Version 01',                             mono: true  },
      { key: 'policy',           label: 'Policy',             value: 'Healthcare Authority Policy'                         },
      { key: 'policyVersion',    label: 'Policy version',     value: 'Version 3.1',                            mono: true  },
      { key: 'evidence',         label: 'Evidence',           value: 'Directive §2.1',                    mono: true  },
    ],
    trace: [
      { label: 'Identity established',          value: 'David Sato',                                          status: 'ok'     },
      { label: 'Authority instrument located',  value: 'Healthcare Proxy Directive',                         status: 'ok'     },
      { label: 'Actor relationship identified', value: 'Healthcare proxy agent',                             status: 'ok'     },
      { label: 'Patient matched',               value: 'Eleanor Sato',                                       status: 'ok'     },
      { label: 'Requested action identified',   value: 'Surgical consent',                                   status: 'ok'     },
      { label: 'Policy evaluated',              value: 'No confirmed policy for healthcare proxy instruments', status: 'review' },
    ],
    decision: 'Review required',
    decisionReason: 'No confirmed institutional policy exists for healthcare proxy instruments. Human review is required before proceeding.',
    decisionTags: ['Evidence: §2.1', 'Authority: Version 01', 'Policy: Version 3.1'],
    evidencePanel: [
      { key: 'Evidence source',    value: 'Healthcare Proxy Directive'                                                     },
      { key: 'Reference',          value: '§2.1'                                                                      },
      { key: 'Relevant authority', value: 'Medical decision-making authority when principal cannot consent'                },
      { key: 'Policy applied',     value: 'Healthcare Authority Policy v3.1 — no confirmed semantics'                },
    ],
    authorityPanel: [
      { key: 'Instrument type', value: 'Healthcare Proxy Directive'             },
      { key: 'Version',         value: '01'                                      },
      { key: 'Principal',       value: 'Eleanor Sato'                            },
      { key: 'Agent',           value: 'David Sato'                              },
      { key: 'Status',          value: 'Verified'                                },
      { key: 'Scope',           value: 'Medical decisions, surgical procedures'  },
    ],
  },
};

// Trace item reveal delays in ms — totals ~1.55s before decision appears
const TRACE_DELAYS = [250, 500, 750, 1000, 1250, 1550];

// ─── SVG icons ────────────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path d="M1.5 4L3 6L6.5 2" stroke="#4EC87A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReviewDot({ size = 8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path d="M4 1.8V4.4" stroke="#D6B58A" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="4" cy="6.2" r="0.65" fill="#D6B58A" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M10 6a4 4 0 11-1.17-2.83" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10.5 1.5v3H7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    >
      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── AuthConsole ──────────────────────────────────────────────────────────────
function AuthConsole() {
  const [activeId, setActiveId]             = useState('banking');
  const [revealedCount, setRevealedCount]   = useState(0);
  const [decided, setDecided]               = useState(false);
  const [openPanel, setOpenPanel]           = useState(null); // 'evidence' | 'authority' | null
  const [detailsOpen, setDetailsOpen]       = useState(false);
  const timerRefs = useRef([]);
  const [scenarioFading, setScenarioFading] = useState(false);
  const fadeTimerRef = useRef(null);

  const scenario = SCENARIOS[activeId];

  const runEvaluation = useCallback(() => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
    setRevealedCount(0);
    setDecided(false);
    setOpenPanel(null);

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setRevealedCount(SCENARIOS[activeId].trace.length);
      setDecided(true);
      return;
    }

    const traceLen = SCENARIOS[activeId].trace.length;
    TRACE_DELAYS.slice(0, traceLen).forEach((delay, i) => {
      const t = setTimeout(() => {
        setRevealedCount(i + 1);
        if (i === traceLen - 1) {
          const t2 = setTimeout(() => setDecided(true), 230);
          timerRefs.current.push(t2);
        }
      }, delay);
      timerRefs.current.push(t);
    });
  }, [activeId]);

  useEffect(() => {
    runEvaluation();
    return () => {
      timerRefs.current.forEach(clearTimeout);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [runEvaluation]);

  function handleScenario(id) {
    if (id === activeId) return;
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setDetailsOpen(false);
    setScenarioFading(true);
    fadeTimerRef.current = setTimeout(() => {
      setActiveId(id);
      setScenarioFading(false);
    }, 170);
  }

  const requestId = scenario.fields.find(f => f.key === 'requestId')?.value ?? '';

  return (
    <div className="ac-console" role="region" aria-label="FieldCore authorization demonstration">

      {/* ── Header ── */}
      <div className="ac-header">
        <div className="ac-header-left">
          <span className="ac-sys-label">FieldCore Authorization</span>
          <span className="ac-req-id">{requestId}</span>
        </div>
        <div
          className={`ac-status${decided ? ' ac-status-decided' : ''}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {decided ? 'Decision reached' : 'Evaluating…'}
        </div>
      </div>

      {/* ── Scenario tabs ── */}
      <div className="ac-tabs" role="tablist" aria-label="Select authorization scenario">
        {Object.values(SCENARIOS).map(s => (
          <button
            key={s.id}
            role="tab"
            aria-selected={activeId === s.id}
            className={`ac-tab${activeId === s.id ? ' ac-tab-active' : ''}`}
            onClick={() => handleScenario(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Scenario body — fades on tab switch ── */}
      <div className={`ac-scenario-body${scenarioFading ? ' ac-scenario-body--fading' : ''}`}>

      {/* ── Human-readable request ── */}
      <div className="ac-request">
        <div className="ac-section-label">Authorization request</div>
        <p className="ac-request-text">{scenario.request}</p>
      </div>

      {/* ── Metadata — desktop always visible, mobile behind toggle ── */}
      <div className="ac-meta-wrapper">
        <button
          className="ac-details-toggle"
          onClick={() => setDetailsOpen(v => !v)}
          aria-expanded={detailsOpen}
        >
          {detailsOpen ? 'Hide request details' : 'View request details'}
          <ChevronIcon open={detailsOpen} />
        </button>
        <div className={`ac-meta${detailsOpen ? ' ac-meta-open' : ''}`} aria-label="Request details">
          {scenario.fields.map(f => (
            <div key={f.key} className="ac-meta-field">
              <div className="ac-meta-label">{f.label}</div>
              <div className={`ac-meta-value${f.mono ? ' ac-meta-mono' : ''}`}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Evaluation trace ── */}
      <div className="ac-trace-section" aria-label="Evaluation trace">
        <div className="ac-section-label">Evaluation trace</div>
        <div className="ac-trace-list">
          {scenario.trace.map((item, i) => (
            <div
              key={`${activeId}-${i}`}
              className={`ac-trace-item${i < revealedCount ? ' ac-revealed' : ''}${item.status === 'review' ? ' ac-trace-review' : ''}`}
            >
              <div className={`ac-trace-dot${item.status === 'review' ? ' ac-trace-dot-review' : ''}`}>
                {item.status === 'review' ? <ReviewDot /> : <CheckIcon />}
              </div>
              <div className="ac-trace-body">
                <div className="ac-trace-step">{item.label}</div>
                <div className={`ac-trace-val${item.status === 'review' ? ' ac-trace-val-review' : ''}`}>
                  {item.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Inline evidence / authority panel ── */}
      {openPanel && (
        <div
          className="ac-panel"
          role="region"
          aria-label={openPanel === 'evidence' ? 'Decision evidence' : 'Authority summary'}
        >
          <div className="ac-panel-header">
            <span className="ac-panel-title">
              {openPanel === 'evidence' ? 'Decision evidence' : 'Authority summary'}
            </span>
            <button
              className="ac-panel-close"
              onClick={() => setOpenPanel(null)}
              aria-label="Close panel"
            >
              <CloseIcon />
            </button>
          </div>
          {(openPanel === 'evidence' ? scenario.evidencePanel : scenario.authorityPanel).map((row, i) => (
            <div key={i} className="ac-panel-row">
              <span className="ac-panel-key">{row.key}</span>
              <span className="ac-panel-val">{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Final decision ── */}
      <div
        className={`ac-decision${decided ? ' ac-decision-visible' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="ac-section-label">FieldCore decision</div>
        <div className="ac-verdict-block">
          <div className="ac-verdict-row">
            <div className="ac-verdict-icon"><ReviewDot size={10} /></div>
            <span className="ac-verdict-text">{scenario.decision}</span>
          </div>
          <p className="ac-verdict-reason">{scenario.decisionReason}</p>
          <div className="ac-verdict-tags" aria-label="Decision evidence references">
            {scenario.decisionTags.map((tag, i) => (
              <span key={i} className="ac-vtag">{tag}</span>
            ))}
          </div>
        </div>
        <div className="ac-decision-actions">
          <button
            className={`ac-btn ac-btn-primary${openPanel === 'evidence' ? ' ac-btn-pressed' : ''}`}
            onClick={() => setOpenPanel(openPanel === 'evidence' ? null : 'evidence')}
            aria-pressed={openPanel === 'evidence'}
          >
            View decision evidence
          </button>
          <button
            className={`ac-btn${openPanel === 'authority' ? ' ac-btn-pressed' : ''}`}
            onClick={() => setOpenPanel(openPanel === 'authority' ? null : 'authority')}
            aria-pressed={openPanel === 'authority'}
          >
            View authority
          </button>
          <button
            className="ac-btn ac-btn-replay"
            onClick={runEvaluation}
            aria-label="Replay evaluation"
          >
            <ReplayIcon />
            Replay evaluation
          </button>
        </div>
      </div>

      </div>{/* end ac-scenario-body */}

      {/* ── Product principle ── */}
      <div className="ac-principle">
        <p className="ac-principle-text">
          FieldCore does not invent authority when evidence or institutional rules are incomplete.
        </p>
        <div className="ac-principle-tags" aria-hidden="true">
          <span className="ac-pt">Policy-aware</span>
          <span className="ac-pt">Evidence-linked</span>
          <span className="ac-pt">Human-safe fallback</span>
          <span className="ac-pt">Audit-ready decision trace</span>
        </div>
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
export default function Hero() {
  return (
    <section id="ph-hero" aria-labelledby="ph-headline">
      <div className="ph-bg-grain" aria-hidden="true" />
      <div className="ph-bg-grid" aria-hidden="true" />
      <div className="ph-inner">
        <div className="ph-left">
          <h1 id="ph-headline" className="ph-headline">
            <span className="ph-hl1">Know who is authorized.</span>
            <span className="ph-hl2">Before the action happens.</span>
          </h1>
          <p className="ph-sub">
            FieldCore turns authority evidence, institutional policy, identity, and request
            context into explainable authorization decisions your systems can act on.
          </p>
          <div className="ph-ctas">
            <a href="/contact" className="ph-cta-primary">Request an enterprise demo</a>
            <a href="#deepdive" className="ph-cta-secondary">See how FieldCore works</a>
          </div>
          <a href="/contact" className="ph-cta-tertiary">Security &amp; Trust &#8594;</a>
        </div>
        <div className="ph-right">
          <AuthConsole />
        </div>
      </div>
    </section>
  );
}
