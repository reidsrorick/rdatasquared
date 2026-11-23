/*
 * ============================================================
 *  EDIT THIS FILE to control what appears on your portfolio page.
 *  Only what you list here is shown, so unlisted apps never appear.
 * ============================================================
 */

window.SITE = {
  name: "R Data Squared",
  eyebrow: "Hello, world 👋",
  heroPrefix: "I build small apps that",
  // These rotate in the headline
  heroWords: [
    "run in your browser",
    "keep your notes",
    "track your budget",
    "settle game night",
    "stay out of your way"
  ],
  tagline: "Fast, friendly web apps with no accounts, no servers and no fuss. Pick one and try it.",

  // Scrolling strip under the hero
  ticker: ["HTML", "CSS", "JavaScript", "PWA", "Local-first", "No build step", "Zero accounts"],

  about: {
    title: "How I build",
    text: "I like software that's quick to open, easy to understand and respects your data.",
    principles: [
      { icon: "🔒", title: "Your data stays yours", text: "Apps store things in your browser or in a file on your own computer. Nothing gets uploaded." },
      { icon: "🪶", title: "Plain and fast", text: "Plain HTML, CSS and JavaScript. No heavy frameworks, no build step, no waiting." },
      { icon: "🚪", title: "No sign-ups", text: "Open the page and start using it. No accounts to create, no hoops to jump through." }
    ]
  },

  footer: "Made with plain HTML, CSS and JS."
};

/*
 * One object per project.
 *   name        (required) project name
 *   description (required) one or two sentences
 *   demo        (required) link to the live app
 *   icon        (optional) an emoji shown on the card
 *   color       (optional) override the card accent (default: brand yellow), e.g. "#e2784f"
 *   tags        (optional) short labels shown on the card
 *   featured    (optional) true = a wide card spanning the full row
 */
var LIVE = "https://www.rdatasquared.com/";

window.PROJECTS = [
  {
    name: "Movie of the Week",
    description: "One hand-picked movie every week from the films I've reviewed, with an archive, what's in theaters, stats and an RSS feed.",
    demo: "https://rmotw.pages.dev/",
    icon: "🎬",
    tags: ["Movies", "Weekly pick"],
    featured: true
  },
  {
    name: "Notebook",
    description: "An installable app for tasks, meeting notes and recurring actions. Your notes are saved to a file on your own computer.",
    demo: LIVE + "todo/",
    icon: "📓",
    tags: ["Productivity", "PWA"]
  },
  {
    name: "Budget",
    description: "A local, no-build budget app for shared costs, subscriptions and expenses, with one-click Excel export.",
    demo: LIVE + "bud/",
    icon: "💸",
    tags: ["Finance", "Local-first"]
  },
  {
    name: "Car Tracker",
    description: "Keep tabs on your vehicles and their maintenance. Your data lives in an Excel sheet that you own: open it, edit it, import or download it.",
    demo: LIVE + "carz/",
    icon: "🚗",
    tags: ["Tracking", "Excel"]
  },
  {
    name: "Daily Game Collection",
    description: "The ultimate collection of daily games, all in one place. Come back every day for a new challenge.",
    demo: LIVE + "daily_games/",
    icon: "🎮",
    tags: ["Games"]
  },
  {
    name: "Uno Rules",
    description: "A quick reference for the rules of Uno, so game night arguments end fast.",
    demo: LIVE + "uno/",
    icon: "🃏",
    tags: ["Games", "Reference"]
  }
];
