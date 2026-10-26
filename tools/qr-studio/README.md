# QR Studio (source-only design workbench)

This is the dependency-free source of **QR Studio v3.3.3**, provided by the
Scripture Baseball project owner. It is intentionally under `tools/`, **not**
`public/` or `src/`.

The original Studio package contains additional screenshots, benchmark output,
reference implementations, fixtures, and generated binaries. Only the working
editor, modules, builder/CLI, license notices, and source QR encoder are vendored
here. See `ARCHITECTURE.md` for the capabilities and design model. The MIT
license and bundled upstream notices remain with the source.

From the Scripture Baseball repository root:

```sh
npm run qr:studio
# Open tools/qr-studio/standalone.html in a browser, even offline.
```

`npm run qr:studio` builds the full designer **locally**, without adding it to
Scripture Baseball's production bundle. The engine can also be used from this
folder for custom exports and experiments. Its CLI supports static SVG exports:

```sh
node tools/qr-studio/scripts/qr-cli.mjs --text 'https://example.org' --out code.svg
```

## Actual app integration

- The editable, conservative QR styles for invitation links are in
  `../qr-invitation-designs.json`.
- `npm run qr:presets` uses the Studio validator to compile these styles into
  `src/qr/presets.generated.js` (tiny, scanner-safe data only).
- Production React imports only **this Studio's MIT-licensed standard QR
  encoding kernel** (`vendor/nayuki-qrcodegen.js`) and those preset constants;
  the editor, designer, animation tooling, and complex renderers are not in the
  runtime bundle.
- A QR code must encode a room's *live* URL. We cannot pre-render a single fixed
  QR image for unknown room codes; the tiny encoder remains necessary.

Only simple opaque, square-module, solid-color styles are currently admitted to
the app. You can experiment with richer designs in Studio, but gradients,
photographs, animated ink, and decorative data-module shapes require scanner
validation **and** a separate supported runtime renderer before shipping.
