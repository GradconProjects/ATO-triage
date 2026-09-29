import Link from 'next/link';
import s from './landing.module.css';

export const metadata = {
  title: 'Know your refund before you lodge',
  description:
    'A guided, occupation-aware interview that estimates your Australian tax refund or debt and explains every figure. Indicative only; not a tax return.',
};

/** Sample ledger lines (the support-worker test case for 2025–26, worked to the cent). */
const SLIP: { label: string; amount: string; kind?: 'neg' | 'strike' | 'sub' }[] = [
  { label: 'Salary and wages', amount: '62,000.00' },
  { label: 'Car · 1,800 km × 88c', amount: '−1,584.00', kind: 'neg' },
  { label: 'Compulsory uniform', amount: '−250.00', kind: 'neg' },
  { label: 'First NDIS worker check', amount: '130.00', kind: 'strike' },
  { label: 'Taxable income', amount: '60,166.00', kind: 'sub' },
  { label: 'Tax on taxable income', amount: '8,837.80' },
  { label: 'Low income tax offset', amount: '−97.51', kind: 'neg' },
  { label: 'Medicare levy', amount: '1,203.32' },
  { label: 'Tax withheld by employer', amount: '11,000.00' },
];

export default function Landing() {
  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header className={s.nav}>
          <Link href="/" className={s.brand} aria-label="Tax Intake Adviser home">
            <span className={s.seal} aria-hidden>
              TI
            </span>
            <span className={s.brandName}>Tax Intake Adviser</span>
          </Link>
          <nav className={s.navLinks} aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#who">Who it&apos;s for</a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/login?admin=1" className={s.navAdmin}>
              Admin
            </Link>
            <Link href="/login" className={s.navCta}>
              Sign in
            </Link>
          </nav>
        </header>

        <main id="main">
          <section className={s.hero}>
            <div>
              <span className={s.eyebrow}>Australian income tax · 2023–24 to 2026–27</span>
              <h1 className={s.headline}>
                Know your refund <em>before</em> you lodge.
              </h1>
              <p className={s.lede}>
                A guided interview in plain English that asks only what matters for your job, then works out an indicative refund or debt and
                shows the working behind every dollar.
              </p>
              <div className={s.ctas}>
                <Link href="/login" className={s.primary}>
                  Sign in to start <span aria-hidden>→</span>
                </Link>
                <a href="#how" className={s.ghost}>
                  See how it works
                </a>
              </div>
              <ul className={s.trust}>
                <li>No tax file number collected</li>
                <li>Every figure explained</li>
                <li>“Not sure” is never treated as “No”</li>
              </ul>
            </div>

            <div className={s.slipStage} aria-label="Example estimate">
              <div className={s.slipBack} aria-hidden />
              <div className={s.slip}>
                <div className={s.slipHead}>
                  <span className={s.slipTitle}>Estimate</span>
                  <span>Support worker · 2025–26</span>
                </div>
                <ul className={s.rows}>
                  {SLIP.map((r, i) => (
                    <li
                      key={r.label}
                      className={`${s.row} ${r.kind === 'sub' ? s.sub : ''}`}
                      style={{ animationDelay: `${0.55 + i * 0.28}s` }}
                    >
                      <span className={r.kind === 'strike' ? s.strike : undefined}>{r.label}</span>
                      <span className={`${s.amt} ${r.kind === 'neg' ? s.neg : ''} ${r.kind === 'strike' ? s.strike : ''}`}>${r.amount}</span>
                    </li>
                  ))}
                  <li className={`${s.row} ${s.total}`} style={{ animationDelay: `${0.55 + SLIP.length * 0.28}s` }}>
                    <span>Indicative refund</span>
                    <span className={s.amt}>$1,056.39</span>
                  </li>
                </ul>
                <span className={s.stamp} aria-hidden>
                  Indicative
                </span>
                <p className={s.slipNote}>Struck lines are shown, not silently dropped: a first check to get a job isn&apos;t claimable.</p>
              </div>
            </div>
          </section>

          <section id="how" className={s.section}>
            <div className={s.sectionHead}>
              <div>
                <span className={s.eyebrow}>How it works</span>
                <h2 className={s.h2}>
                  Three steps, <em>no guesswork.</em>
                </h2>
              </div>
              <p className={s.sectionLede}>
                The interview never fills in an answer for you. If you&apos;re unsure, say so: it becomes an item to check in your report instead
                of a silent assumption.
              </p>
            </div>
            <ol className={s.steps}>
              <li className={s.step}>
                <div className={s.stepNum}>01</div>
                <h3>Answer what applies</h3>
                <p>Pick your job and the questions follow it. A chef never sees a sleepover-shift question; a carpenter gets asked about bulky tools.</p>
              </li>
              <li className={s.step}>
                <div className={s.stepNum}>02</div>
                <h3>See every figure</h3>
                <p>Each line of the estimate shows the rule and the formula behind it, with a live refund or debt as you go and a range when things are uncertain.</p>
              </li>
              <li className={s.step}>
                <div className={s.stepNum}>03</div>
                <h3>Keep the report</h3>
                <p>Generate a PDF snapshot that never changes afterwards: answers, workings, items to review and opportunities to check.</p>
              </li>
            </ol>
            <div className={s.facts}>
              <div className={s.fact}>
                <div className={s.factValue}>4</div>
                <div className={s.factLabel}>financial years of rates, each value linked to its ATO source</div>
              </div>
              <div className={s.fact}>
                <div className={s.factValue}>450+</div>
                <div className={s.factLabel}>questions, but you only see the ones that apply to you</div>
              </div>
              <div className={s.fact}>
                <div className={s.factValue}>36</div>
                <div className={s.factLabel}>checks that flag missing records, risks and things you may have missed</div>
              </div>
              <div className={s.fact}>
                <div className={s.factValue}>$0.01</div>
                <div className={s.factLabel}>worked in whole cents, never rounded along the way</div>
              </div>
            </div>
          </section>

          <section id="who" className={s.section}>
            <div className={s.sectionHead}>
              <div>
                <span className={s.eyebrow}>Who it&apos;s for</span>
                <h2 className={s.h2}>
                  Built around <em>real work.</em>
                </h2>
              </div>
              <p className={s.sectionLede}>
                Deep question sets for the jobs where claims are most often missed or mistaken, and sensible general questions for everyone else.
              </p>
            </div>
            <ul className={s.occupations}>
              <li className={s.chip}>
                Support workers<small>NDIS · aged care</small>
              </li>
              <li className={s.chip}>
                Construction &amp; trades<small>tools · PPE · FIFO</small>
              </li>
              <li className={s.chip}>
                Chefs &amp; hospitality<small>knives · whites · RSA</small>
              </li>
              <li className={s.chip}>
                Office &amp; professional<small>home office · phone</small>
              </li>
              <li className={s.chip}>
                Rental, shares &amp; crypto<small>for everyone</small>
              </li>
              <li className={s.chip}>
                WorkCover &amp; back pay<small>lump sum E</small>
              </li>
            </ul>
          </section>

          <section className={s.closing}>
            <h2 className={s.h2}>
              Walk into tax time <em>already knowing.</em>
            </h2>
            <div className={s.ctas}>
              <Link href="/login" className={s.primary}>
                Sign in <span aria-hidden>→</span>
              </Link>
            </div>
          </section>
        </main>

        <footer className={s.footer}>
          <p>
            Every figure is an indicative estimate prepared from information you provide. It is not tax advice and is not a tax return. Final
            outcomes are determined by the ATO. Consider seeking advice from a registered tax agent. Not affiliated with or endorsed by the
            Australian Taxation Office. <Link href="/privacy">Privacy notice</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
