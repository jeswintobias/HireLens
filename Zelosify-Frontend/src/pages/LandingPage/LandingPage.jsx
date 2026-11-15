import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  FileUp,
  Gauge,
  Scale,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import LandingNavbar from "@/components/LandingPage/navbar/LandingNavbar";

const STEPS = [
  {
    icon: FileUp,
    title: "Vendors submit candidates",
    text: "IT vendors browse their organization's open contract roles and drag-and-drop PDF or PPTX resumes.",
  },
  {
    icon: Bot,
    title: "An AI agent screens each resume",
    text: "A tool-calling agent parses the resume, extracts skills and experience, and runs the matching engines in the background.",
  },
  {
    icon: UserCheck,
    title: "Hiring managers decide",
    text: "Candidates arrive ranked, with a score, confidence and plain-language explanation. Shortlist or reject in one click.",
  },
];

const FEATURES = [
  {
    icon: Scale,
    title: "Explainable, rule-based scores",
    text: "50% skills, 30% experience, 20% location. The AI explains; transparent rules decide.",
  },
  {
    icon: ShieldCheck,
    title: "Built to resist manipulation",
    text: "Hidden text, injected instructions and fake tags are detected and stripped before the AI reads a resume.",
  },
  {
    icon: Building2,
    title: "Multi-tenant by design",
    text: "Every query is scoped to your organization, and managers only ever see their own openings.",
  },
  {
    icon: Gauge,
    title: "Fast, never blocking",
    text: "Uploads return in milliseconds while recommendations run in a background queue.",
  },
];

/** Static, clearly labelled example of a hiring-manager profile card (no real data). */
function PreviewCard() {
  const bars = [
    ["Skills", 100],
    ["Experience", 100],
    ["Location", 50],
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <p className="relative mb-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Example recommendation
      </p>
      <div
        className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden="true" />
        <div className="space-y-4 p-5 pl-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">candidate_resume.pdf</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Full Stack Engineer · Hyderabad</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <Sparkles className="h-3 w-3" aria-hidden="true" /> Recommended
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
            {[
              ["Score", "90%"],
              ["Confidence", "84%"],
              ["Processing", "4.4 s"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>

          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            Matches all 5 required skills and has 4 years of experience, within the 3–6 year range. Based in Pune
            while the role is onsite in Hyderabad.
          </p>

          <div className="grid grid-cols-3 gap-3">
            {bars.map(([label, pct]) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="text-xs">{label}</span>
                  <span className="text-xs tabular-nums">{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <span className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900 dark:text-rose-300">
              Reject
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Shortlist
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="relative px-4 pb-16 pt-32 sm:px-6 lg:pb-24 lg:pt-40">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-gradient-to-b from-blue-50 to-transparent dark:from-blue-950/40"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-gray-900 dark:text-blue-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI-assisted contract hiring
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Hire contract talent with AI{" "}
              {/* Explicit size: the app's global `* { font-size: medium }` rule would shrink this span. */}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl text-transparent sm:text-5xl">
                you can audit.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-gray-600 dark:text-gray-300 lg:mx-0">
              Vendors submit candidates, an AI agent screens every resume against the opening, and hiring managers get
              ranked, explained recommendations, scored by transparent rules rather than black-box guesses.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-shadow hover:shadow-xl sm:w-auto"
              >
                Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800 sm:w-auto"
              >
                Create an account
              </Link>
            </div>
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              For IT vendors and hiring managers · Two-factor authentication on every account
            </p>
          </div>
          <PreviewCard />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-gray-100 px-4 py-16 dark:border-gray-800 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">How it works</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600 dark:text-gray-400">
            One shared workflow for both sides of contract hiring.
          </p>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li
                key={title}
                className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-gray-400 dark:text-gray-500">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 px-4 py-16 dark:bg-gray-900/50 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Trustworthy by design</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-900">
                <Icon className="h-6 w-6 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-100 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        © {new Date().getFullYear()} Zelosify · Contract hiring module
      </footer>
    </div>
  );
}
