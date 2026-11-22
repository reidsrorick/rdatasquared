# DUNESDAY

A countdown to **December 18, 2026**: *Dune: Part Three* and *Avengers: Doomsday* at AMC NorthPark 15.

Plain HTML, CSS, and JS. No build step, no dependencies. Made to be hosted free on GitHub Pages and shared by text.

## What's in v1

- Live countdown (days / hours / minutes / seconds) to the next showing: Dune first, then Doomsday. The browser tab title shows the time left
- Ticket cards for each showing (theater, time, "Thu night" style labels for after-midnight shows); a showing flips to "Seen" once it starts
- Animated desert at dusk: layered dunes, two moons, drifting sand on a canvas
- **Theme switch in the title:** tap **DUNE** for the Dune theme (desert orange) or **SDAY** for Doomsday (green). The active half glows. It re-themes the whole page and is remembered per device
- **Voice lines:** tapping DUNE says "Lisan al Gaib!" with a desert drum hit, and tapping SDAY says "VICTOR" with an iron clang. The song dips underneath. The browser's built-in voice speaks them (deepest English voice on the device). To use your own recordings, put them in `assets/sounds/` and set `file` under `voiceLines` in `js/config.js`. Muted means silent
- **Doomsday extras:** an iron mask appears on the big moon, plus a green **Kneel** button (the page bows, the mask's eyes flare, and each device counts its kneels)
- **Theater card:** address, Google/Apple Maps directions, and a dark-styled embedded map
- **Worm meter:** fills from Nov 18 to the first showing. Worms also cross the dunes on their own, about every 3 minutes a month out and every ~15 seconds by the end
- **Sound (on by default):** *Dream of Arrakis* loops a section of the real track (0:00 to 1:30 by default), played through WaterTower Music's official YouTube upload. Browsers only allow sound after a tap, so it starts on the visitor's first tap anywhere, and a "Tap anywhere for sound" hint shows until then. In the last 10 seconds before each showing, the song fades out and an original synthesized desert hum takes over. The hum swells, hits once a second, and lands one big hit at zero, then the song comes back. The corner speaker button mutes everything, and each device remembers it. If the song can't load (offline, blocked, or the page was opened straight from the file), the hum plays instead so there's always sound. Add `?nosong` to the URL to test that. There's also a link to the full song on Spotify
- **Installable:** "Add to home screen" gives a Dunesday app icon that opens full screen and works offline. Android/desktop Chrome shows an install button; on iPhone the button explains the Share → Add to Home Screen steps
- **Add to calendar** (downloads an `.ics` invite with both showings and a 2-hour reminder) and **Share** (native share sheet on phones, copies the link on desktop)
- **Seats** on each ticket (e.g. "Row K · Seats 19–22")
- **Final-minute takeover:** for the last 60 seconds before each showing, a full-screen countdown with the theater and seats. The screen shakes harder each second through the last 10. At zero it shows "Now showing" with the title, then clears after 8 seconds. The × closes it
- **Tab icon countdown:** the browser-tab icon shows the days left, then hours on the last day, minutes in the last hour, and seconds in the last minute, in the current theme's color
- Tap the sky for a puff of sand
- Easter egg: tap the DUNESDAY title 3 times fast (or type `worm`) to summon a sandworm
- When each showing starts, the worm comes out. After the last one, the page switches to "complete" mode. Preview that any time with `?arrived` on the URL
- Link-preview card (Open Graph + Twitter tags with a 1200×630 image) so iMessage, WhatsApp, Discord, and others show a rich preview

## Files

```
index.html               page + link-preview meta tags
css/style.css            all styling, both themes
js/config.js             <- edit this: showings, theater, site URL
js/main.js               countdown, sand, themes, worm, meter, kneel, theater, share/calendar, install
js/audio.js              the synthesized desert hum (the final-10-seconds swell)
manifest.webmanifest     app name + icons for "Add to home screen"
sw.js                    offline cache (bump VERSION in it if you add files)
assets/icon-192.png, assets/icon-512.png   app icons
assets/og-image.png      the link-preview image (1200x630)
assets/apple-touch-icon.png, assets/favicon.svg
tools/og-card.html       source for the preview image
tools/render-images.ps1  re-renders the preview image + icon with headless Chrome
```

## Where it lives

It's served from the `dunesday/` folder of the `reidsrorick/rdatasquared` repo (`master` branch), which GitHub Pages publishes at **https://www.rdatasquared.com/dunesday/**. All the URLs in `index.html` and `js/config.js` already point there.

To publish, copy everything in this folder **except `.claude/`** into `dunesday/` in that repo, then commit and push to `master`. It's live a minute or two later.

When you change any CSS or JS, bump the `?v=` number on the `<link>` and `<script>` tags in `index.html`. GitHub Pages lets browsers reuse files for 10 minutes, and the new number makes them load the matching versions right away.

## Personal links

Text each friend their own link:

```
https://www.rdatasquared.com/dunesday/?name=Mike&side=doom
```

- `name` shows "Hey Mike" at the top. Underscores become spaces (`?name=Big_Mike` → "Big Mike"). It's remembered on their phone, so it still shows when they open the home-screen app
- The first time each person opens their link, a **welcome pop-up** greets them by name, with both showtimes, their seats, and **Add to calendar** / **Let's go** buttons (tapping Let's go also starts the music). It shows once per name per device; add `&welcome` to the link to show it again
- `side` sets their starting theme: `dune` or `doom`. Once they tap DUNE or SDAY themselves, their own choice wins
- `?name=` with nothing after it clears a saved name (handy if you test a friend's link on your own phone)

## Try it on your computer

Don't double-click `index.html`. YouTube won't play the song in a page opened straight from a file, so you'd only get the hum. Serve the folder instead (needs Node.js):

```powershell
npx http-server -p 5180 -c-1
```

Then open http://localhost:5180 and tap anywhere for sound.

## Getting a good text preview

- `og:image` **must** be an absolute `https://` URL, which is why the full rdatasquared.com address is written out in `index.html`.
- Check it before you text it: paste the URL into [opengraph.xyz](https://www.opengraph.xyz/) to see the card.
- iMessage caches previews hard. Send the link once you're happy with it. If you change the image later, rename the file (e.g. `og-image-v2.png`) and update the meta tags so phones fetch the new one.
- To tweak the card, edit `tools/og-card.html`, then run `powershell -File tools/render-images.ps1`.

## Customize

Everything personal lives in `js/config.js`:

- `showings` are the movies the countdown targets: title, team, start time (with a UTC offset, `-06:00` = Central), theater, and optionally `format`, `durationMin`, `seats` (e.g. `["K19", "K20"]`), `poster` (a TMDB image URL), and `letterboxd` (the film's page; the poster and a small link open it). Keep ticket links out of here; the site is public
- `timeZone` is the zone showtimes display in, for every viewer
- `theater` is the name, address, and note on the map card
- `meterStart` is when the worm meter starts filling
- `clip` is the Dream of Arrakis section that loops: change `start` and `end` (seconds) to play a different part. The track runs 0:00 to 3:08 in that video
- `soundtrackLink` is where "Full song on Spotify" goes

Fan-made for friends. Not affiliated with Legendary, Warner Bros., or Marvel Studios.
