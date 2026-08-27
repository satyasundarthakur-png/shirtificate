import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowDown,
  Baby,
  Brain,
  Download,
  Droplets,
  FileText,
  Flame,
  Hand,
  Heart,
  HeartPulse,
  Phone,
  Pill,
  Syringe,
  Timer,
  TriangleAlert,
  Waves,
  Wind,
  Zap,
} from "lucide-react";

import ecardPdf from "@/assets/cpr-student-ecard.pdf.asset.json";
import walletPdf from "@/assets/cpr-wallet-ecard.pdf.asset.json";
import notesDocx from "@/assets/cpr-notes.docx.asset.json";
import ecardPreview from "@/assets/cpr-ecard-preview.png.asset.json";
import walletPreview from "@/assets/cpr-wallet-preview.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CPR & First Aid Training Hub — Notes, E-Cards & Downloads" },
      {
        name: "description",
        content:
          "Hands-Only CPR steps, high-quality compression guide, AED use, choking and first-aid quick reference, plus downloadable AHA CPR notes and student e-cards.",
      },
      { property: "og:title", content: "CPR & First Aid Training Hub" },
      {
        property: "og:description",
        content:
          "Hands-Only CPR steps, AED guidance, first-aid quick reference and downloadable CPR training documents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const compressions = [
  { icon: ArrowDown, label: "Deep enough", detail: "At least 2 inches" },
  { icon: Activity, label: "Fast enough", detail: "100–120 compressions / min" },
  { icon: Heart, label: "Full recoil", detail: "Let the chest return to normal position" },
  { icon: Timer, label: "Don't pause", detail: "Never interrupt for more than 10 seconds" },
];

const breathsFor = [
  "Infants",
  "Children",
  "Choking",
  "Drowning",
  "Drug overdose",
  "Any respiratory cause",
];

const firstAid = [
  {
    icon: HeartPulse,
    title: "Heart Attack",
    points: [
      "Keep the person calm and resting",
      "Phone 9-1-1, get the first aid kit and an AED",
      "Chew 1 adult or 2 low-dose aspirins if no allergy",
      "Start CPR if they become unresponsive",
    ],
  },
  {
    icon: Brain,
    title: "Stroke — act FAST",
    points: [
      "Face drooping · Arm weakness · Speech difficulty",
      "Time to phone 9-1-1 — note when signs appeared",
      "Watch for sudden confusion, vision or balance loss",
    ],
  },
  {
    icon: Droplets,
    title: "Bleeding",
    points: [
      "Firm pressure on a dressing over the wound",
      "Tourniquet 2–3 inches above the site, toward the heart",
      "Still bleeding? Apply a second tourniquet above the first",
    ],
  },
  {
    icon: Wind,
    title: "Choking (unresponsive)",
    points: [
      "Shout for help, phone 9-1-1, get an AED",
      "Start CPR — 30 compressions, check the mouth",
      "Never do a blind finger sweep",
      "Repeat 30 compressions + 2 breaths",
    ],
  },
  {
    icon: Pill,
    title: "Opioid Emergency",
    points: [
      "Phone 9-1-1 and give naloxone if available",
      "Not breathing normally: start CPR and use the AED",
      "Never delay CPR to give naloxone",
    ],
  },
  {
    icon: Flame,
    title: "Burns",
    points: [
      "Cool water and clean dressings only",
      "Never use ice — it damages burned skin",
    ],
  },
  {
    icon: TriangleAlert,
    title: "Shock",
    points: [
      "Help the person lie on their back",
      "Cover with a blanket to keep them warm",
    ],
  },
  {
    icon: Waves,
    title: "Water Safety",
    points: [
      "Adults give touch supervision to new swimmers",
      "Stay within arm's reach of the child at all times",
    ],
  },
];

const documents = [
  {
    name: "CPR Notes",
    format: "DOCX",
    description: "Full course notes — CPR, AED, choking, first aid and more.",
    url: notesDocx.url,
    icon: FileText,
    preview: null as string | null,
  },
  {
    name: "Student E-Card",
    format: "PDF",
    description: "American Heart Association course completion e-card.",
    url: ecardPdf.url,
    icon: HeartPulse,
    preview: ecardPreview.url,
  },
  {
    name: "Wallet E-Card",
    format: "PDF",
    description: "Wallet-sized student e-card — print and carry.",
    url: walletPdf.url,
    icon: Baby,
    preview: walletPreview.url,
  },
];

function SectionHeading({
  kicker,
  title,
  light = false,
}: {
  kicker: string;
  title: string;
  light?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <p
        className={`font-mono text-xs font-semibold uppercase tracking-[0.25em] ${
          light ? "text-pulse-foreground/60" : "text-primary"
        }`}
      >
        {kicker}
      </p>
      <h2
        className={`mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl ${
          light ? "text-pulse-foreground" : "text-foreground"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}

function Index() {
  return (
    <main className="min-h-screen bg-background font-body">
      {/* Hero */}
      <section className="relative overflow-hidden bg-pulse text-pulse-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-40 -translate-y-1/2 opacity-10"
        >
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="h-full w-full">
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              points="0,60 300,60 340,60 360,20 385,100 410,45 430,60 700,60 740,60 760,10 790,110 815,40 835,60 1200,60"
            />
          </svg>
        </div>
        <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <p className="inline-flex items-center gap-2 rounded-full border border-pulse-foreground/20 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.25em] text-pulse-foreground/70">
            <HeartPulse className="h-3.5 w-3.5" />
            American Heart Association · Course Materials
          </p>
          <h1 className="mt-8 max-w-3xl font-display text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
            CPR saves lives. <span className="text-primary">Be ready.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-pulse-foreground/70">
            Hands-Only CPR steps, AED guidance and first-aid essentials from the
            course notes — plus your training documents and e-cards, all in one place.
          </p>
          <div className="mt-10">
            <Link
              to="/certificate"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <FileText className="h-4 w-4" />
              Open the certificate editor
            </Link>
          </div>
          <div className="mt-10 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-pulse-foreground/15 p-5">
              <p className="font-display text-3xl font-black text-primary">10%</p>
              <p className="mt-1 text-sm text-pulse-foreground/70">
                drop in survival for every minute without CPR
              </p>
            </div>
            <div className="rounded-xl border border-pulse-foreground/15 p-5">
              <p className="font-display text-3xl font-black text-primary">100–120</p>
              <p className="mt-1 text-sm text-pulse-foreground/70">
                compressions per minute — push hard and fast
              </p>
            </div>
            <div className="rounded-xl border border-pulse-foreground/15 p-5">
              <p className="font-display text-3xl font-black text-primary">2 in</p>
              <p className="mt-1 text-sm text-pulse-foreground/70">
                minimum compression depth for an adult
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Hands-Only CPR */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading kicker="Hands-Only CPR" title="Two steps. That's it." />
        <p className="mt-4 max-w-2xl text-muted-foreground">
          If a person becomes unresponsive and is not breathing, begin CPR. These
          steps apply in all situations and for everyone, including pregnant women.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="group rounded-2xl border bg-card p-8 transition-colors hover:border-primary">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Phone className="h-6 w-6" />
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Step 1
            </p>
            <h3 className="mt-2 font-display text-2xl font-black">Phone 9-1-1</h3>
            <p className="mt-2 text-muted-foreground">
              Call immediately — or send someone else to call and get an AED.
            </p>
          </div>
          <div className="group rounded-2xl border bg-card p-8 transition-colors hover:border-primary">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Hand className="h-6 w-6" />
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Step 2
            </p>
            <h3 className="mt-2 font-display text-2xl font-black">
              Push hard and fast
            </h3>
            <p className="mt-2 text-muted-foreground">
              In the center of the chest — at least 2 inches deep, 100–120 times a
              minute. Switch rescuers about every 2 minutes.
            </p>
          </div>
        </div>

        <div className="mt-14">
          <h3 className="font-display text-xl font-extrabold">
            What makes a compression high-quality?
          </h3>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {compressions.map((c) => (
              <div key={c.label} className="rounded-xl border bg-card p-6">
                <c.icon className="h-6 w-6 text-primary" />
                <p className="mt-4 font-display font-bold">{c.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Breaths + AED */}
      <section className="bg-secondary">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2">
          <div>
            <SectionHeading kicker="Compressions + Breaths" title="30 to 2" />
            <p className="mt-4 text-muted-foreground">
              Give sets of 30 compressions and 2 breaths. Tilt the head back, lift
              the chin, pinch the nose, and blow for 1 second per breath — watch
              the chest rise. Don't pause compressions more than 10 seconds.
            </p>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Breaths matter most for
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {breathsFor.map((b) => (
                <span
                  key={b}
                  className="rounded-full border bg-card px-4 py-1.5 text-sm font-medium"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div>
            <SectionHeading kicker="AED" title="Turn it on. Follow the prompts." />
            <p className="mt-4 text-muted-foreground">
              An AED analyzes the heart rhythm and can deliver a shock that resets
              it. It only shocks when needed — anyone can use one safely, and you
              should use it the moment it arrives, even mid-CPR.
            </p>
            <div className="mt-6 flex items-start gap-4 rounded-xl border border-primary/30 bg-accent p-5">
              <Zap className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <p className="text-sm font-medium text-accent-foreground">
                Good Samaritan laws in all 50 US states protect people who try to
                help save a life. You cannot hurt someone by giving CPR.
              </p>
            </div>
            <div className="mt-4 flex items-start gap-4 rounded-xl border bg-card p-5">
              <Syringe className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Naloxone reverses an opioid overdose — give it as soon as you can,
                but never delay CPR to do it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* First aid grid */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading kicker="First Aid Quick Reference" title="Know the response" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {firstAid.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border bg-card p-6 transition-colors hover:border-primary"
            >
              <item.icon className="h-7 w-7 text-primary" />
              <h3 className="mt-4 font-display text-lg font-extrabold">{item.title}</h3>
              <ul className="mt-3 space-y-2">
                {item.points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* Documents */}
      <section className="bg-pulse text-pulse-foreground">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading
            kicker="Documents"
            title="Course materials & e-cards"
            light
          />
          <p className="mt-4 max-w-2xl text-pulse-foreground/70">
            Download the complete training notes and your American Heart
            Association student e-cards.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <a
                key={doc.name}
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-2xl border border-pulse-foreground/15 bg-pulse-foreground/5 transition-colors hover:border-primary"
              >
                <div className="flex h-44 items-center justify-center overflow-hidden bg-pulse-foreground/5">
                  {doc.preview ? (
                    <img
                      src={doc.preview}
                      alt={`${doc.name} preview`}
                      loading="lazy"
                      className="h-full w-full object-cover object-top opacity-90 transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <doc.icon className="h-14 w-14 text-pulse-foreground/40" />
                  )}
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg font-extrabold">{doc.name}</h3>
                    <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                      {doc.format}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-pulse-foreground/60">
                    {doc.description}
                  </p>
                  <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    <Download className="h-4 w-4" />
                    Download
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-pulse-foreground/10 bg-pulse px-6 py-8">
        <p className="mx-auto max-w-6xl text-center font-mono text-xs uppercase tracking-[0.2em] text-pulse-foreground/40">
          CPR · AED · First Aid — American Heart Association course materials
        </p>
      </footer>
    </main>
  );
}
