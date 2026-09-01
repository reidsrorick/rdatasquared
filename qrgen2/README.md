# QR Code Creator

A static, client-side QR code generator you can host for free on GitHub Pages.
No build step, no backend, no tracking — everything runs in the visitor's browser.

## Features

- **Content types:** Website, Text, Email, Phone, SMS, WiFi, Contact (vCard),
  Calendar event (iCal), Location, LinkedIn, Discord, Spotify, X / Twitter,
  YouTube, WhatsApp, PayPal, and Crypto.
- **Center logo / image:** add a PNG, JPG, or SVG by choosing a file, **pasting**
  an image from the clipboard (Ctrl/⌘+V anywhere on the page), or **dragging** one
  onto the box. Always centered, with an optional cleared area behind it and
  adjustable size / padding. Error correction is nudged up automatically when a
  logo is added.
- **Styling:** foreground & background colors, transparent background, dot styles
  (square, dots, rounded, extra-rounded, classy, classy-rounded), corner frame /
  center styles and colors, quiet-zone margin, output size, and error-correction
  level.
- **Defaults:** plain black-on-white, centered, square modules.
- **Export:** PNG, SVG, or JPEG download, plus "copy PNG to clipboard".
- Your last settings and field values are remembered locally (localStorage).

## Run locally

Just open `index.html`, or serve the folder:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy to GitHub Pages

1. Create a repository and push these files to the default branch.
2. In **Settings → Pages**, set **Source** to *Deploy from a branch* and pick the
   branch root (`/`).
3. Your site will be live at `https://<user>.github.io/<repo>/`.

The included `.nojekyll` file tells Pages to serve everything as-is.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Markup and controls |
| `styles.css` | Styling (light + dark aware) |
| `app.js` | Content-type builders and QR rendering |
| `vendor/qr-code-styling.js` | Bundled [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) library (MIT) |

## Credits

QR rendering by [qr-code-styling](https://github.com/kozakdenys/qr-code-styling)
by Denys Kozak, MIT licensed.
