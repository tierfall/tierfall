import Link from 'next/link';
import type { ReactNode } from 'react';

const HERO_CODE = `import { Router, DefaultPolicy } from '@tierfall/core';
import { OllamaAdapter } from '@tierfall/adapter-ollama';
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';

const router = new Router({
  adapters: [
    new OllamaAdapter({ baseUrl: 'http://localhost:11434' }),
    new OpenAICompatibleAdapter(
      presets.groq({ apiKey: process.env.GROQ_API_KEY! }),
    ),
  ],
  policy: new DefaultPolicy({ maxCostPerCall: 0.01 }),
});

const reply = await router.complete({
  messages: [{ role: 'user', content: 'Hello' }],
});
// Falls groq -> ollama on budget or provider error.
// Never climbs.`;

export default function HomePage(): ReactNode {
  return (
    <main className="tf-landing">
      <section className="tf-hero">
        <div className="tf-hero-left">
          <BrandMark />
          <h1 className="tf-title">TierFall</h1>
          <p className="tf-tagline">Local-first AI routing for TypeScript.</p>
          <p className="tf-motto">Fall, never climb.</p>
          <div className="tf-cta">
            <Link href="/docs" className="tf-cta-primary">
              Read the docs →
            </Link>
            <Link href="https://github.com/tierfall/tierfall" className="tf-cta-secondary">
              GitHub
            </Link>
          </div>
        </div>
        <div className="tf-hero-right">
          <div className="tf-codeblock-frame">
            <div className="tf-codeblock-bar" aria-hidden="true">
              <span /> <span /> <span />
            </div>
            <pre className="tf-codeblock">
              <code>{HERO_CODE}</code>
            </pre>
          </div>
        </div>
      </section>

      <section className="tf-values">
        <ValueCard
          title="Four-tier ladder"
          body="On-device · Self-hosted edge · Cheap cloud · Premium cloud. Adapters declare their tier; the router walks the ladder."
        />
        <ValueCard
          title="Vendor-neutral"
          body="No SDK lock-in. Adapters use Node's built-in fetch only. Swap providers without touching application code."
        />
        <ValueCard
          title="Declarative policy"
          body="Capability gates, cost ceilings, context-window limits. Filters silently before routing; falls explicitly during routing."
        />
        <ValueCard
          title="Local-first by design"
          body="Default to Ollama. Cloud is the fallback, not the start. Hard budget cap means the cloud can't quietly drain the budget."
        />
      </section>

      <section className="tf-ladder" aria-label="Tier ladder">
        <h2 className="tf-section-title">How the fall works</h2>
        <div className="tf-ladder-track">
          <TierStep label="premium-cloud" sub="Anthropic, GPT-5" />
          <FallArrow />
          <TierStep label="cheap-cloud" sub="Groq, DeepSeek, Cerebras" />
          <FallArrow />
          <TierStep label="self-hosted-edge" sub="vLLM, LM Studio" />
          <FallArrow />
          <TierStep label="on-device" sub="Ollama" landing />
        </div>
        <p className="tf-ladder-caption">
          A request enters at the highest tier its policy permits, falls to the next on{' '}
          <code>BudgetExceededError</code>, <code>CapabilityMismatchError</code>, or{' '}
          <code>ProviderUnavailableError</code>. There is no path back up.
        </p>
      </section>

      <section className="tf-install">
        <h2 className="tf-section-title">Install</h2>
        <pre className="tf-install-snippet">
          <code>{`npm install @tierfall/core @tierfall/adapter-openai-compatible`}</code>
        </pre>
        <p className="tf-install-note">
          Released under <strong>Apache-2.0</strong>. v0.1.0 is the first public release —{' '}
          <Link href="https://github.com/tierfall/tierfall/releases/tag/v0.1.0" className="tf-link">
            release notes
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

function ValueCard({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <article className="tf-value-card">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function TierStep({
  label,
  sub,
  landing = false,
}: {
  label: string;
  sub: string;
  landing?: boolean;
}): ReactNode {
  return (
    <div className={landing ? 'tf-tier tf-tier-landing' : 'tf-tier'}>
      <code className="tf-tier-label">{label}</code>
      <span className="tf-tier-sub">{sub}</span>
    </div>
  );
}

function FallArrow(): ReactNode {
  return (
    <span className="tf-fall-arrow" aria-hidden="true">
      ↓
    </span>
  );
}

function BrandMark(): ReactNode {
  return (
    <svg
      className="tf-brandmark"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      role="img"
      aria-label="TierFall"
    >
      <rect className="tf-brandmark-tier" x="4" y="3" width="16" height="2" rx="1" />
      <rect className="tf-brandmark-tier" x="4" y="8" width="16" height="2" rx="1" />
      <rect className="tf-brandmark-tier" x="4" y="13" width="16" height="2" rx="1" />
      <rect className="tf-brandmark-tier" x="4" y="18" width="16" height="2" rx="1" />
      <rect className="tf-brandmark-fall" x="11" y="1" width="2" height="20" rx="1" />
      <path className="tf-brandmark-fall" d="M8 21 L16 21 L12 24 Z" />
    </svg>
  );
}
