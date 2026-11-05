# How QR Codes Work — an interactive walkthrough

A single-page explorable explainer that builds a QR code from scratch, one
decision at a time: data modes, version sizing, bit packing, Reed–Solomon error
correction, the module matrix, and data masking. The final chapter is a working
QR generator you can download PNG/SVG from.

**No dependencies, no build step.** Plain HTML, CSS and JavaScript. The QR
encoder ([`assets/js/qrcode.js`](assets/js/qrcode.js)) is written from scratch —
it does not use any QR library.

## Run it locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy to GitHub Pages

1. Create a repo and commit these files (keep the `.nojekyll` file — it tells
   Pages to serve the folder verbatim).
2. Push to GitHub.
3. **Settings → Pages** → Source: your default branch, folder `/ (root)`.
4. The site publishes at `https://<user>.github.io/<repo>/`.

## Project layout

```
index.html              markup + chapter shell
assets/css/styles.css   playful/colourful theme, light + dark
assets/js/qrcode.js     the encoder: modes, versions 1–40, L/M/Q/H,
                        Reed–Solomon over GF(256), block interleaving,
                        8 masks with penalty scoring, format/version info
assets/js/app.js        the walkthrough UI (chapters, controls, visuals)
```

## About the encoder

`QRCode.encode(text, opts)` returns the module matrix plus a `trace` object
exposing every intermediate value (bit groups, codewords, ECC blocks, the
interleaved sequence, per-mask penalty scores, the region map, and the data
placement order) so the UI can show the pipeline step by step.

Supported: numeric, alphanumeric and byte (UTF-8) modes; versions 1–40; error
correction levels L, M, Q, H; automatic ECC boosting when there is spare
capacity; automatic mask selection. Not implemented: Kanji mode, structured
append, ECI.

The matrix-construction approach follows the public-domain reference design by
[Project Nayuki](https://www.nayuki.io/page/qr-code-generator-library),
re-implemented here in an annotated form. Output is verified against the
published "HELLO WORLD" worked example (data **and** Reed–Solomon codewords).

## License

MIT — see [LICENSE](LICENSE).

QR Code is a registered trademark of Denso Wave Incorporated. This project is
educational and is not affiliated with or endorsed by Denso Wave.
