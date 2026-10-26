# QR Studio 3.0 — final architecture and engineering decisions

Version 3.1 builds on the three completed development windows. **One engine powers the UI, API and CLI.** The editor and export flow use the same QR matrix and style schema; content encoding is not coupled to visual effects.

## Runtime architecture

```text
Data source                    Encoding                        Style / presentation
 text / URL / vCard      ──> generateQR(...)               state / JSON design / palette
 CSV, TSV, sequence      ──> encodeQR/encodeMicroQR/rMQR    normalizeStyle(...)
 Structured Append       ──> encodeStructuredAppend(...)   paints, photo layers, masks,
                           immutable matrix + roles         shadow, logo, frame
                                   │                           │
                                   └──────────┬────────────────┘
                                              ▼
                                     renderSVG(qr, style)
                                        │            │
                                  inline editor     serialization
                                      preview         ├─ SVG / physical SVG
                                                      ├─ Canvas PNG/JPEG/WebP
                                                      └─ Canvas PDF/EPS raster print
                                                           │
                    iterateBatch ──> row validation ──> toBlob ──> createBatchZip
                                                           │
                                                 streamed Writable / Blob
```

Core source lives under `src/` with exactly one implementation per responsibility:

- `encoder.js`, `charset-data.js`, `segment-optimizer.js`: Standard QR + Unicode/automatic segment planning, ECI, masks and corrections. Encoded data is independent of renderer choices.
- `micro-qr.js`, `rmqr.js`, `rmqr-versions.js`, `roles.js`, `variants.js`: specialized encoders and a shared matrix/roles interface for renderers. Micro and rMQR are **not** standard matrices resized or visually distorted.
- `structured-append.js`: splits input without breaking UTF-8 characters, computes message parity, adds the Structured Append header to each Standard QR symbol, returns canonical records and metadata. Specialized readers are required to reassemble.
- `styles.js` and `media.js`: validate normalized style, component paints, local raster image layers and shadow parameters. No remote images or injected SVG/CSS values.
- `render-svg.js`: shared declarative rendering (module shapes, finder protection, image masks, photo filters, multistop gradients, shadows, logo and captions). Its result is the exact SVG used by preview/export.
- `export.js` and `print-export.js`: SVG/Canvas downloads, physical print sizes, pixel/raster print files; EPS uses JPEG DCT image and PDF uses lossless RGB/Flate image. Neither PDF nor EPS is misrepresented as fully vector.
- `raster-layout.js`, `image-tools.js` / `qr-self-decoder.js`: local palette extraction, rendered pixel contrast sampling, optional browser-native scan, known-grid Standard QR parity verification; last mechanism is *not* arbitrary QR detection.
- `batch.js`, `batch-input.js`, `batch-zip.js`: canonical row model, async iteration, text/CSV/TSV/sequences, incremental ZIP with CRC32, manifest, cancellation/limits and per-row status.
- `design-file.js`: v4 JSON design format, deduplicated embedded assets; accepts prior design versions and validates before import.
- `ui/app.js`, `ui/batch-ui.js`, `ui/studio.css`: state-driven editor, preview controls, named snapshots/compare, inspect-to-edit, download and batch presentation. `scripts/build.mjs` bundles UI and engine into `standalone.html` and builds `dist/qr-engine.js`.
- `scripts/qr-cli.mjs`: pure Node SVG and SVG ZIP wrapper on the public engine without a duplicate implementation.
- `src/index.js`, `src/index.d.ts`: sole entry point for consumers; versioned TypeScript declarations for public options.

## Design principles and invariants

1. **Separation of concerns:** QR bit placement/RS parity and module function roles are immutable. Styling never edits encoded QR bits. Colors, photos and shadows only change rendering, and all render variants use the same normalized style.
2. **Small composable public API:** `generateQR`, `renderSVG`, `toBlob`, `encodeStructuredAppend`, `iterateBatch`, `createBatchZip`, `packDesign`, `renderPrintSVG`. API additions are documented in `src/index.d.ts`; no implicit network or hidden storage in the core.
3. **Transactional validation:** reject malformed QR settings, unsafe image data URLs, styles, oversized inputs and untrusted imported assets *before* mutating UI state. `normalizeStyle` makes rendering output predictable; document load either validates in full or leaves the active design untouched.
4. **Local-only and constrained:** restrict sources to embedded raster URLs and local user files, escape text/meta strings, disallow remote links within generated SVG, enforce upload and output caps. ZIP names are sanitized with duplicate disambiguation; manifest payloads are opt-in and CSV formula-injection safe.
5. **Memory-aware batching:** `iterateBatch` yields independent results; `createBatchZip` writes ZIP32 local headers, data descriptors and central directory incrementally. Browser can save to File System Access writer; otherwise an in-memory Blob is bounded. Node CLI streams ZIP bytes to disk.
6. **Rendering integrity:** finder patterns retain their geometry, photo layers are clipped to the QR matrix, and captions sit outside the scanning matrix. Shadows may feather into quiet zones (with warnings), instead of being abruptly truncated at the matrix edge. User may still create unsafe art; warnings and actual-pixel sampling are advisory, not a compatibility promise.
7. **Offline-first browser compatibility:** production builds have no package dependencies and make no external requests; `standalone.html` contains all CSS, JS and encoder resources. Browser-only Canvas paths are isolated from pure functions that run under Node.
8. **Version-safe documents:** v4 deduplicates original photo assets; v2/v3 assets are migrated on load. Local named snapshots (up to 12) use localStorage when possible, with nonpersistent fallback and JSON export for backup.
9. **Reference parity and acceptance testing:** Nayuki standard matrices, Segno Micro/Kanji/Hanzi/Structured Append and `rmqrcode` rMQR fixtures; Node+TypeScript; browser V2/Window1/Window2/Window3 suites; Poppler/Ghostscript printed-export render/decode checks.

## Export paths, limitations and honesty

- SVG keeps vector QR shapes and embeds any uploaded photos as raster data. Print SVG adds physical mm dimensions and safe metadata without changing the matrix layout.
- Raster PNG/JPEG/WebP and PDF/EPS need Canvas and a browser. PDF stores lossless RGB image data; EPS stores a JPEG-compressed raster image, which may be less tolerant of tiny print sizes. JPEG and print formats flatten alpha onto an explicit matte.
- QR Studio supports **static QR codes** only: a user-created URL payload cannot be changed after printing unless the URL points to a service the user operates. GitHub Pages cannot host the required dynamic redirect service.
- The **motion layer** (`motion.js`, `render-svg.js`) uses a separately validated, versioned `motion` configuration; QR matrices never change. `renderAnimatedSVG` produces looped, script-free SVG animation; `renderAnimationFrameSVG(timeSeconds)` produces deterministic static phase samples. `toCanvas(...,{frameTime})` feeds the same geometry to offline tests. Static exports remain unchanged. Animated GIF/APNG/WebP/MP4 export and exhaustive scanning are deferred. CMYK print separations remain unsupported.
- Micro/rMQR and Structured Append vary by scanner. The in-browser pixel checker/parity fallback is deliberately narrower than a general-purpose QR decoder; real-world validation remains recommended for complex art.

## Build and regression verification

```sh
npm run check
python tests/browser-v2.py
python tests/browser-v3.py
python tests/browser-v3-window2.py
python tests/browser-v3-window3.py
```

Development-only Python/Poppler/Ghostscript/OpenCV/Playwright tools are not bundled. `scripts/build.mjs` is the single packaging pipeline for modular ESM and offline standalone HTML. The full archive preserves upstream notices and source references.

## 3.0.1 stabilization contracts

- **Renderer coordinate spaces**: gradient paints default to `space: "global"` for backward compatibility. New designs may use `"component"`, `"eye"`, and `"module"` for local coordinates. The renderer maps these to explicit SVG user-space bounds; the encoder never changes. Per-eye overrides may contain complete `QRPaint` gradients.
- **Unified state**: batch exports use `baseStyleOptions()` and `normalizedEncoding()`; the currently selected preview row does not affect shared batch defaults. Preview and batch apply per-row overrides independently.
- **Shared sampling geometry**: `raster-layout.js` maps known QR module centers into a possibly caption-extended pixel canvas. Both contrast analysis and parity verification consume this helper and share the frame settings used for raster export.
- **Shadow semantics**: filters apply to grouped silhouettes, not to a rectangular CSS preview effect or one filter per module. Feathering can enter the quiet zone, with explicit scan-risk guidance. Exact offsets are module units, with an approximate equivalent in preview pixels.
- **Regression coverage**: stabilization tests protect per-eye fills, gradient scopes, framed scanning, batch version normalization, CSV style isolation, shadow picker behavior, batch list pagination and quiet-zone diagnostics.

## 3.1.0 motion and scan diagnostics

- **QR invariant:** encoding and every function module are unchanged. In the default `protectEyes` mode, the sweep only clips to the data-module silhouette. Unprotected motion requires explicit opt-in and shows warnings.
- **No fake contrast protection:** moving backgrounds use a capped overlay opacity (0.22 max); color choices may still reduce scan reliability. An animated SVG is not certified scannable.
- **Deterministic frames:** animated SVG and fixed-time raster snapshots use the same band rotation, travel bounds and clipping paths. The browser tests eight time samples and validates known QR grid parity. It does not simulate autofocus, motion blur, glare, or frame timing of physical scanners.
- **Accessibility:** playback can be paused, scrubbed, and explicitly resumed. System reduced-motion settings pause the editor and suppress exported SVG motion until explicitly enabled in the UI.
- **Exports:** only `animated-svg` retains the effect. Ordinary `.svg`, `.png`, `.jpg`, `.webp`, `.pdf`, `.eps` are intentionally static. Animated SVG in image viewers varies by platform.

## 3.2.0 Procedural aurora and timed loop addition

The new motion field is implemented in pure `src/aurora-field.js` (deterministic SVG path curves), not in the QR encoder. `src/motion.js` validates phase/hold settings; the renderer reuses a *single* field via two SVG `<use>` instances clipped to full artwork and to data/finder ink. The ring-shaped eye mask uses `clip-rule="evenodd"` so blank finder cells remain blank. Extended artboard coordinates are handled by the shared module sampling helper in `raster-layout.js`, including printed aspect ratios. Standard QR parity and runtime scanner checks remain advisory. See [AURORA-ARCHITECTURE.md](AURORA-ARCHITECTURE.md).
