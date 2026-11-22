/*
 * DUNESDAY config — edit this file to customize the page.
 * Everything here is plain data; main.js reads it.
 */
window.DUNESDAY = {
  // Time zone of the theater. Showtimes display in this zone no matter where the viewer is.
  timeZone: "America/Chicago",

  // The showings. The countdown targets the next one, then the one after.
  // start includes the UTC offset (-06:00 = US Central in December).
  // poster: official poster loaded from The Movie Database (TMDB). Find a movie on themoviedb.org,
  // open its poster, and use https://image.tmdb.org/t/p/w342/<file>.jpg. Leave it out for no poster.
  // letterboxd: the film's Letterboxd page (the poster and a small link open it).
  // format (e.g. "IMAX with Laser") and durationMin are optional; the runtime shows on the ticket
  // when set, and sets the calendar event's end time (3 hours if left out).
  // Don't put ticket links here: this page is public.
  showings: [
    { title: "Dune: Part Three", side: "spice", start: "2026-12-18T00:45:00-06:00", theater: "AMC NorthPark 15", format: "IMAX with Laser", durationMin: 150,
      poster: "https://image.tmdb.org/t/p/w342/gknAq4pAuToh1Aq5CJfVkGQkExT.jpg",
      letterboxd: "https://letterboxd.com/film/dune-part-three/" },
    { title: "Avengers: Doomsday", side: "doom", start: "2026-12-20T02:00:00-06:00", theater: "AMC NorthPark 15", format: "Infinity Vision", durationMin: 165,
      poster: "https://image.tmdb.org/t/p/w342/cWXtJhrlruF8CeYuaBGE8vdj3Q9.jpg",
      letterboxd: "https://letterboxd.com/film/avengers-doomsday/" },
  ],

  // Where we're watching. Used for the map card and directions links.
  theater: {
    name: "AMC NorthPark 15",
    address: "8687 N Central Expy, Suite 3000, Dallas, TX 75225",
    note: "Level 3 of NorthPark Center",
  },

  // The worm meter fills from this moment up to the first showing.
  meterStart: "2026-11-18T00:00:00-06:00",

  // A section of the real track, played through WaterTower Music's official YouTube upload
  // (the full Dune soundtrack; Dream of Arrakis is the first track, 0:00 to 3:08).
  // start/end are in seconds: change them to play a different part.
  clip: { title: "Dream of Arrakis", artist: "Hans Zimmer", youtubeId: "uTmBeR32GRA", start: 0, end: 90 },

  // Opens the full song in Spotify.
  soundtrackLink: "https://open.spotify.com/search/Dream%20of%20Arrakis%20Hans%20Zimmer",

  // The public URL of the site (used by Share + the calendar invite).
  // If the address changes, update the matching URLs in index.html <head> too.
  siteUrl: "https://www.rdatasquared.com/dunesday/",
};
