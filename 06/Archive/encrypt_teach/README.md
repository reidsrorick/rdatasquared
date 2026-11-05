# The Broken Chain — a field manual in cryptanalysis

An interactive site that teaches encryption as an **adversarial chain**: every
cipher exists because you are about to break the previous one — yourself, in the
browser. Not a catalogue of ciphers in glass cases; one continuous argument.

Each lesson follows the same three beats:

- **How it works** — encrypt / decrypt it yourself.
- **How it breaks** — run the attack with your own hands.
- **What it forced** — the design the break demanded, which is the next lesson.

## The spine

| # | Lesson | The break you run |
|---|--------|-------------------|
| 0 | Encoding ≠ Hashing ≠ Encryption | Sort each transform: reversible, and by whom? Base64 decodes with no key. |
| 1 | Caesar | Brute-force all 25 shifts at once. |
| 2 | Keyed substitution | Frequency analysis + a drag/type mapping board — 2⁸⁸ keys, cracked by hand. |
| 3 | Vigenère | Kasiski + Friedman find the period; it collapses into Caesars. |
| 4 | One-time pad | Two-time pad: reuse the key, XOR cancels it, crib-drag both messages out. |
| 5 | Block ciphers & ECB | The ECB penguin — real AES, correct key, the picture survives. |
| 6 | Modes & malleability | CTR bit-flip: flip one ciphertext bit, flip one plaintext bit — then AEAD rejects it. |
| 7 | Diffie–Hellman | A passive eavesdropper fails; a man-in-the-middle walks in. |
| 8 | RSA | Textbook RSA is deterministic → a public-key dictionary attack → why we need IND-CPA. |
| 9 | Don't roll your own | A **live** timing side channel, and a weak RNG making predictable keys. |

The central idea, planted in lesson 2 and never let go: **keyspace size is not
security.** A cipher leaks through any structure it fails to destroy.

## Running it

**Just open it.** Double-click `index.html`. Everything is vanilla HTML / CSS /
JS — no framework, no build step, no bundler, no dependencies. Scripts are plain
classic scripts (not ES modules) specifically so the pages work straight off the
filesystem (`file://`) in Chrome and Firefox, which otherwise block module
imports from local files.

**Web Crypto note.** The modern-crypto lessons (AES, SHA-256, HMAC, ECDH) use
the browser's native [Web Crypto API](https://developer.mozilla.org/docs/Web/API/Web_Crypto_API).
Chrome and Firefox treat `file://` as a secure context, so `crypto.subtle` works
when you open the files directly. If your browser is an exception, serve the
folder over HTTP instead:

```sh
python -m http.server 8000
# then visit http://localhost:8000
```

Over `https://` (including GitHub Pages) everything works unconditionally.

## Deploying to GitHub Pages

The repository root is the site root, so deployment is just publishing the repo
on a `gh-pages` branch (or enabling Pages on `main`):

```sh
git checkout -b gh-pages
git add -A
git commit -m "Publish The Broken Chain"
git push -u origin gh-pages
```

Then in the repository settings enable **Pages** and point it at the `gh-pages`
branch, root folder. The included empty `.nojekyll` file tells Pages to serve the
`src/` directory and every file as-is (Jekyll otherwise skips some paths).

## What's toy and what's real

- **Classical / toy ciphers** (Caesar → one-time pad, plus toy RSA and toy DH)
  are implemented in readable, heavily commented JavaScript under `src/ciphers/`
  and `src/analysis/`, one concept per file, pure and testable. Anywhere a toy
  implementation is used for teaching, the UI shows a persistent red **TEACHING
  ONLY — NOT FOR PRODUCTION** warning. Toy RSA/DH print their prime bit-size and
  state what real deployments use (≥ 2048-bit, or X25519).
- **Real modern crypto** (AES-ECB/CBC/CTR/GCM, SHA-256, HMAC, ECDH) is **never
  hand-rolled** — it goes through Web Crypto (`src/crypto/`).

## Design

The look is a cryptanalyst's worksheet: iron-ink on a pale squared ledger. The
one signature element is the **quadrille grid**, used not as wallpaper but as the
live working surface the interactive tools snap to. Colour is semantic — indigo
is construction, **red is cryptanalysis** (breaks, danger, toy-crypto warnings)
and appears nowhere as mere decoration. Light and dark themes both ship.

Accessibility: keyboard-operable interactives (the mapping board and sorting
exercise take typed / keyed input, not drag alone), visible focus rings, semantic
headings, a skip link, works down to 360px wide, and honours
`prefers-reduced-motion`.

## Tests

Open `tests/test.html` (directly or over HTTP). It runs pure-function tests for
every classical cipher and every cryptanalysis routine, plus optional Web Crypto
round-trip / tamper-rejection checks, and prints a pass/fail summary. No build,
no runner, no network.

## Structure

```
index.html              the landing page / the spine
lessons/                one HTML page per stop (00–09)
src/
  util/                 bytes & English-language statistics
  ciphers/              Caesar, substitution, Vigenère, OTP, encoding, toy RSA/DH
  analysis/             frequency, Kasiski, index of coincidence, crib-drag
  crypto/               Web Crypto wrappers (AES, HMAC, ECDH) — never hand-rolled
  ui/                   shared interactive widgets + the shell (nav/footer)
styles/                 tokens, base, worksheet, components
tests/test.html         pure-function + Web Crypto tests
```

Everything runs locally in your browser. No text you type ever leaves the page.
