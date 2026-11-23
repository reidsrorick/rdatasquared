/*
 * ============================================================
 *  EDIT THIS FILE to control what appears on your landing page.
 *  Nothing is fetched from GitHub: only what you list here is shown,
 *  so unlisted folders never appear.
 * ============================================================
 */

window.SITE = {
  name: "R Data Squared",
  title: "My Projects",
  tagline: "Small, fast web apps that run right in your browser. No accounts, no servers.",
  github: "https://github.com/reidsrorick/rdatasquared",
  footer: "Built with plain HTML, CSS and JS."
};

/*
 * One object per project.
 *   name        (required) project name
 *   description (required) one or two sentences
 *   url         (required) link to the source code
 *   demo        (optional) live app URL
 *   tags        (optional) array of short labels, used for filtering
 *   featured    (optional) true = shows a "Featured" badge and sorts first
 */
var REPO = "https://github.com/reidsrorick/rdatasquared/tree/master/";
var LIVE = "https://www.rdatasquared.com/";

window.PROJECTS = [
  {
    name: "QR Code Creator",
    description: "Generate QR codes for links, WiFi, contacts, events and more, with a custom center logo. Runs entirely in your browser.",
    url: REPO + "qrgen2",
    demo: LIVE + "qrgen2/",
    tags: ["tools", "generator"],
    featured: true
  },
  {
    name: "Notebook",
    description: "An installable app for tasks, meeting notes and recurring actions. Your notes are saved to a file on your own computer.",
    url: REPO + "todo",
    demo: LIVE + "todo/",
    tags: ["productivity", "pwa"],
    featured: true
  },
  {
    name: "Timesheet / PTO Tracker",
    description: "Track hours and time off, with JSON backups and Excel export. Everything is stored locally in your browser.",
    url: REPO + "timesheet",
    demo: LIVE + "timesheet/",
    tags: ["productivity", "tools"]
  },
  {
    name: "Rolodex One (RDX1)",
    description: "A private contact and relationship tracker with reminders and birthdays. No accounts, no server, no tracking.",
    url: REPO + "rdx1",
    demo: LIVE + "rdx1/",
    tags: ["productivity", "pwa"]
  },
  {
    name: "Budget",
    description: "A local, no-build budget app for shared costs, subscriptions and expenses, with Excel export.",
    url: REPO + "bud",
    demo: LIVE + "bud/",
    tags: ["finance", "productivity"]
  },
  {
    name: "Car Tracker",
    description: "Keep track of your vehicles in a simple, fast web app.",
    url: REPO + "carz",
    demo: LIVE + "carz/",
    tags: ["tools"]
  },
  {
    name: "Daily Game Collection",
    description: "The ultimate collection of daily games, all in one place.",
    url: REPO + "daily_games",
    demo: LIVE + "daily_games/",
    tags: ["games"]
  },
  {
    name: "Trivia Host",
    description: "Run a trivia night: host questions and keep the game moving.",
    url: REPO + "trivia",
    demo: LIVE + "trivia/",
    tags: ["games"]
  },
  {
    name: "Uno Rules",
    description: "A quick reference for the rules of Uno.",
    url: REPO + "uno",
    demo: LIVE + "uno/",
    tags: ["games"]
  },
  {
    name: "DUNESDAY",
    description: "A live countdown to December 18, 2026 with an animated desert and switchable Dune / Doomsday themes.",
    url: REPO + "dunesday",
    demo: LIVE + "dunesday/",
    tags: ["fun", "countdown"]
  }
];
