'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const VERTICALS = [
  'HVAC', 'Plumbing', 'Electrical', 'Roofing', 'Landscaping',
  'Cleaning', 'Pest Control', 'Pool Service', 'Painting', 'General Contractor',
  'Appliance Repair', 'Locksmith', 'Moving', 'Auto Detailing', 'Other',
];

const TEAM_SIZES = [
  { value: '1', label: 'Just me' },
  { value: '2-5', label: '2–5 people' },
  { value: '6-15', label: '6–15 people' },
  { value: '15+', label: '15+ people' },
];

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [businessName, setBusinessName] = useState('');
  const [vertical, setVertical] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleComplete() {
    setLoading(true);
    setError('');

    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessName, vertical, teamSize }),
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#1C2333] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span
            className="text-2xl font-black tracking-widest text-white"
            style={{ fontFamily: 'Arial Black, sans-serif' }}
          >
            FIELDCORE<sup className="text-[#D6B58A] text-sm ml-0.5">™</sup>
          </span>
          <p className="text-[#8A90A2] text-sm mt-2">
            Step {step} of 3
          </p>
          <div className="flex gap-1.5 justify-center mt-3">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 w-12 rounded-full transition-colors ${
                  s <= step ? 'bg-[#D6B58A]' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-white text-lg font-semibold">What&apos;s your business name?</h2>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Acme Services LLC"
                className="w-full bg-white/[0.06] border border-white/[0.10] rounded-lg px-3.5 py-2.5 text-white placeholder-[#8A90A2] focus:outline-none focus:border-[#D6B58A] transition-colors text-sm"
              />
              <button
                onClick={() => setStep(2)}
                disabled={!businessName.trim()}
                className="w-full bg-[#D6B58A] hover:bg-[#c9a87a] disabled:opacity-50 disabled:cursor-not-allowed text-[#1C2333] font-semibold rounded-lg py-2.5 text-sm transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-white text-lg font-semibold">What&apos;s your trade?</h2>
              <div className="grid grid-cols-2 gap-2">
                {VERTICALS.map((v) => (
                  <button
                    key={v}
                    onClick={() => setVertical(v)}
                    className={`text-sm px-3 py-2 rounded-lg border transition-colors text-left ${
                      vertical === v
                        ? 'border-[#D6B58A] bg-[#D6B58A]/10 text-[#D6B58A]'
                        : 'border-white/10 text-[#8A90A2] hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 border border-white/10 text-[#8A90A2] hover:text-white rounded-lg py-2.5 text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!vertical}
                  className="flex-1 bg-[#D6B58A] hover:bg-[#c9a87a] disabled:opacity-50 disabled:cursor-not-allowed text-[#1C2333] font-semibold rounded-lg py-2.5 text-sm transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-white text-lg font-semibold">How big is your team?</h2>
              <div className="space-y-2">
                {TEAM_SIZES.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setTeamSize(value)}
                    className={`w-full text-sm px-3.5 py-2.5 rounded-lg border transition-colors text-left ${
                      teamSize === value
                        ? 'border-[#D6B58A] bg-[#D6B58A]/10 text-[#D6B58A]'
                        : 'border-white/10 text-[#8A90A2] hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 border border-white/10 text-[#8A90A2] hover:text-white rounded-lg py-2.5 text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={!teamSize || loading}
                  className="flex-1 bg-[#D6B58A] hover:bg-[#c9a87a] disabled:opacity-50 disabled:cursor-not-allowed text-[#1C2333] font-semibold rounded-lg py-2.5 text-sm transition-colors"
                >
                  {loading ? 'Setting up…' : 'Launch dashboard'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
