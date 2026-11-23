/*
 * ============================================================
 *  EDIT THIS FILE to control what appears on your portfolio page.
 *  Nothing is fetched from GitHub: only what you list here is shown,
 *  so unlisted folders never appear.
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
  github: "https://github.com/reidsrorick/rdatasquared",

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
 *   url         (required) link to the source code
 *   demo        (optional) live app URL
 *   icon        (optional) an emoji shown on the card
 *   color       (optional) override the card accent (default: brand yellow), e.g. "#e2784f"
 *   tags        (optional) short labels shown on the card
 */
var REPO = "https://github.com/reidsrorick/rdatasquared/tree/master/";
var LIVE = "https://www.rdatasquared.com/";

window.PROJECTS = [
  {
    name: "Notebook",
    description: "An installable app for tasks, meeting notes and recurring actions. Your notes are saved to a file on your own computer.",
    url: REPO + "todo",
    demo: LIVE + "todo/",
    icon: "📓",
    tags: ["Productivity", "PWA"]
  },
  {
    name: "Budget",
    description: "A local, no-build budget app for shared costs, subscriptions and expenses, with one-click Excel export.",
    url: REPO + "bud",
    demo: LIVE + "bud/",
    icon: "💸",
    tags: ["Finance", "Local-first"]
  },
  {
    name: "Daily Game Collection",
    description: "The ultimate collection of daily games, all in one place. Come back every day for a new challenge.",
    url: REPO + "daily_games",
    demo: LIVE + "daily_games/",
    icon: "🎮",
    tags: ["Games"]
  },
  {
    name: "Uno Rules",
    description: "A quick reference for the rules of Uno, so game night arguments end fast.",
    url: REPO + "uno",
    demo: LIVE + "uno/",
    icon: "🃏",
    tags: ["Games", "Reference"]
  }
];
