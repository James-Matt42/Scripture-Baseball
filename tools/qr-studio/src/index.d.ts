/** QR Studio 3 (window 3) — offline ES module API. Browser APIs are only required for raster/file operations. */
export type EccLevel = 'L' | 'M' | 'Q' | 'H';
export type EncodeMode = 'auto' | 'numeric' | 'alphanumeric' | 'byte' | 'kanji' | 'hanzi';
export type CharacterSet = 'utf-8' | 'iso-8859-1' | 'shift-jis' | 'gb2312';
export type QRKind = 'standard' | 'micro' | 'rmqr';
export type QRRole = 'data' | 'finder' | 'finderCenter' | 'separator' | 'timing' | 'alignment' | 'format' | 'version' | 'darkModule';
export type ModuleShape = 'square' | 'rounded' | 'circle' | 'diamond' | 'horizontal' | 'vertical' | 'connected-rounded';
export type EyeShape = 'square' | 'rounded' | 'circle';
export type CSSHexColor = string; // Runtime-validated: #RGB[A], #RRGGBB[AA], or 'transparent'.
export type MicroVersion = 'M1' | 'M2' | 'M3' | 'M4';
export type RMQRVersion = `R${number}x${number}`;

export interface EncodeOptions {
  errorCorrection?: EccLevel;
  version?: number | 'auto';
  minVersion?: number;
  maxVersion?: number;
  mask?: number | 'auto';
  boostErrorCorrection?: boolean;
  mode?: EncodeMode;
  charset?: CharacterSet;
  eci?: 'none' | 'auto' | number;
  /** Opt-in dynamic programming of numeric/alphanumeric/byte/Kanji segments. */
  optimizeSegments?: boolean;
  /** Allow experimental Hanzi mode in automatic optimizer. */
  enableHanzi?: boolean;
}
export interface MicroEncodeOptions {
  version?: 'auto' | MicroVersion;
  errorCorrection?: 'auto' | 'none' | 'L' | 'M' | 'Q';
  mask?: 'auto' | 0 | 1 | 2 | 3;
  mode?: EncodeMode;
  /** Micro QR has no ECI; auto selects Latin-1 when representable, otherwise UTF-8. */
  charset?: 'auto' | 'utf-8' | 'iso-8859-1';
}
export interface RMQREncodeOptions {
  version?: 'auto' | RMQRVersion;
  errorCorrection?: 'M' | 'H';
  mode?: EncodeMode;
  fit?: 'balanced' | 'min-width' | 'min-height' | 'min-area';
}
export type QRSegmentInput =
  | { mode: 'numeric'; text: string }
  | { mode: 'alphanumeric'; text: string }
  | { mode: 'byte'; text: string; bytes?: never }
  | { mode: 'byte'; bytes: Uint8Array | ArrayBuffer | number[]; text?: never }
  | { mode: 'eci'; assignment: number }
  | { mode: 'kanji'; codes: number[]; text?: never } // Shift-JIS double-byte code units.
  | { mode: 'kanji'; text: string; codes?: never }
  | { mode: 'hanzi'; codes: number[]; text?: never } // GB2312 double-byte code units.
  | { mode: 'hanzi'; text: string; codes?: never }
  | { mode: 'structured-append'; index: number; total: number; parity: number };
export interface QRWarning { code: string; message: string; severity: 'warning' | 'error'; }
export interface QRMatrix {
  /** Equals width for rMQR; do not assume symbols are always square. */
  readonly size: number;
  readonly width: number;
  readonly height: number;
  getModule(x: number, y: number): boolean;
  getRole(x: number, y: number): QRRole | null;
  getRoleId(x: number, y: number): number;
  toRows(): boolean[][];
  /** Defensive copy of row-major modules (1=dark, 0=light). */
  toUint8Array(): Uint8Array;
}
export interface QRMetadata {
  readonly kind: 'QR Model 2' | 'Micro QR' | 'rMQR';
  readonly version: number | MicroVersion | RMQRVersion;
  readonly size: number;
  readonly width: number;
  readonly height: number;
  readonly mask: number | 'Fixed';
  readonly requestedErrorCorrection: EccLevel | 'auto' | 'none';
  readonly errorCorrection: EccLevel | 'None';
  readonly dataBits: number;
  readonly segmentCount: number;
  readonly segmentModes: readonly string[];
  readonly sourceLength: number;
  readonly hasBinary?: boolean;
  readonly charset?: string | null;
  readonly structuredAppend?: {readonly index:number; readonly total:number; readonly parity:number};
}
export interface QRCodeResult {
  readonly matrix: QRMatrix;
  readonly metadata: QRMetadata;
  readonly warnings: readonly QRWarning[];
  readonly encoding: Readonly<EncodeOptions | MicroEncodeOptions | RMQREncodeOptions>;
}

/** Legacy whole-QR gradient; new code should prefer the per-area `paints` API. */
export interface QRGradient {
  type: 'linear' | 'radial';
  colors: CSSHexColor[];
  rotation?: number;
  applyTo?: 'all' | 'data';
}
export interface QRPaintStop { offset: number; color: CSSHexColor; }
export type QRGradientSpace = 'global' | 'component' | 'eye' | 'module';
export type QRPaint = CSSHexColor
  | { type: 'solid'; color: CSSHexColor }
  | { type: 'linear'; stops: QRPaintStop[]; angle?: number; space?: QRGradientSpace }
  | { type: 'radial'; stops: QRPaintStop[]; cx?: number; cy?: number; radius?: number; space?: QRGradientSpace };
export type QRPaintArea = QRRole | 'finderLight' | 'background' | 'quietZone';
export type QREyePosition = 'topLeft' | 'topRight' | 'bottomLeft';
export interface QREyeStyle {
  outerShape?: EyeShape;
  innerShape?: EyeShape;
  outerColor?: QRPaint;
  innerColor?: QRPaint;
  lightColor?: QRPaint;
}
export interface QREyes extends QREyeStyle {
  positions?: Partial<Record<QREyePosition, QREyeStyle>>;
}
export interface QRLogo {
  /** Local data:image/png|jpeg|webp|gif;base64,... . No remote URLs or SVG logos. */
  dataUrl: string;
  /** Fraction of the smaller matrix dimension, 0.04–0.30. */
  size?: number;
  /** Padding in QR module units, 0–4. */
  padding?: number;
  /** Image corner radius, 0–0.5. */
  rounding?: number;
  /** 'match' inherits underlying QR paint; 'transparent' adds no backing. */
  background?: 'match' | 'transparent' | CSSHexColor;
  /** When true, remove underlying QR modules in the logo's bounding area. */
  clearModules?: boolean;
}
/** Only raster data URLs are accepted; never remote URLs or user-authored SVG. */
export interface QRImageLayer {
  dataUrl: string;
  fit?: 'cover' | 'contain';
  x?: number; y?: number; zoom?: number;
  /** Intrinsic source width/height, enables precise panning when crop != QR aspect. */
  aspectRatio?: number;
  opacity?: number;
  brightness?: number; contrast?: number; saturation?: number;
  /** Blur in QR-module units, not export pixels. */
  blur?: number;
  rotation?: number;
  /** Optional constrained photographic tonality. Use light for photo backgrounds and dark for image-filled modules. */
  tone?: 'none' | 'light' | 'dark';
  toneStrength?: number;
  tint?: CSSHexColor;
  tintOpacity?: number;
  /** Optional SVG compositing blend mode. */
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'difference';
  /** Posterize embedded photo channels to 2–12 levels; 0 disables. */
  posterize?: number;
}
export interface QRShadow {
  color?: CSSHexColor;
  opacity?: number;
  /** Blur and offsets measured in QR modules. */
  blur?: number; offsetX?: number; offsetY?: number;
}
export interface QRFrame {
  label:string; labelColor?:CSSHexColor; fill?:CSSHexColor;
  fontSize?:number; padding?:number;
  borderColor?:CSSHexColor; borderWidth?:number; radius?:number;
}
export type QRImageTarget = 'background' | 'data';
export type QRShadowTarget = 'modules' | 'finder' | 'logo';
/** One deterministic animation definition; it never alters encoded QR modules. */
/** A single timeline for module-safe animation and seamless procedural fields. */
export type QRMotionType='none'|'wave'|'background'|'glow'|'aurora-veils'|'aurora-ribbons'|'aurora-northern'|'ocean-crosscurrents';
export interface QRMotion {
  type?: QRMotionType;
  /** Primary animated highlight. #RRGGBB or #RRGGBBAA. */
  color?: CSSHexColor;
  strength?: number; // 0–1
  duration?: number; // moving seconds per cycle, 0.8–30
  hold?: number; // extra still seconds after moving, 0–20
  holdPhase?: number; // 0–1; frame where the loop starts, ends, and holds
  width?: number; // sweep width relative to QR matrix, .08–1
  angle?: number; // -180 through 180 degrees
  /** When false, animate finder ink (ring+center), never finder blank ring. */
  protectEyes?: boolean;
  coverage?: 'both'|'ink'|'background'; // procedural aurora field destinations
  artboard?: number; // extra backdrop width in module units, 0–24
  contrast?: 'protected'|'artistic'; // backdrop/ink treatment
  detail?: number; // number/complexity of curtains, 0–1
  /** Custom palette: base QR ink first, then 2–7 ribbon colors. Null uses preset. */
  palette?: CSSHexColor[] | null;
  fieldScale?: number; // .6–2.5, independent of QR geometry
  fieldRotation?: number; // -180–180 degrees, independent of QR geometry
  glow?: number; // blur/glow strength, 0–1
}
export declare const MOTION_TYPES: readonly QRMotionType[];
export declare const AURORA_TYPES: readonly QRMotionType[];
export declare const AURORA_COLORS: Readonly<Record<string,CSSHexColor>>;
export declare const AURORA_PALETTES: Readonly<Record<string,readonly CSSHexColor[]>>;
export declare function auroraPalette(motion: QRMotion): readonly CSSHexColor[];
export declare const MOTION_DEFAULTS: Readonly<Required<QRMotion>>;
export declare function normalizeMotion(motion?: QRMotion | null): Readonly<Required<QRMotion>>;
/** Moving seconds followed by optional static hold. */
export declare function motionCycle(motion: Required<QRMotion>): number;
/** Periodic motion phase 0–1, frozen at user-selected holdPhase during the still hold. */
export declare function motionPhase(motion: Required<QRMotion>,timeSeconds:number):number;
export interface QRStyleOptions {
  /** Exported raster image width, 64–8192. rMQR height scales to preserve aspect ratio. */
  size?: number;
  quietZone?: number;
  foreground?: CSSHexColor;
  background?: CSSHexColor;
  shape?: ModuleShape;
  moduleScale?: number;
  cornerRadius?: number;
  gradient?: QRGradient | null;
  eyes?: QREyes | null;
  components?: Partial<Record<QRRole, CSSHexColor | { dark?: CSSHexColor; light?: CSSHexColor }>> | null;
  /** Per-component solid, transparent, linear, and radial fills with positioned stops. */
  paints?: Partial<Record<QRPaintArea, QRPaint>> | null;
  logo?: QRLogo | null;
  /** Independent, validated image layers. Dark data uses a clipping mask. */
  images?: Partial<Record<QRImageTarget, QRImageLayer>> | null;
  motion?: QRMotion | null;
  shadows?: Partial<Record<QRShadowTarget, QRShadow>> | null;
  /** Decorative caption or optional outer border outside the QR matrix. */
  frame?: QRFrame | null;
  title?: string;
}
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'animated-svg' | 'apng' | 'pdf' | 'eps';
export interface APNGOptions {size?:number;fps?:4|6|8|10|12;signal?:AbortSignal;onProgress?:(p:{done:number;total:number})=>void;}
export interface QRPrintOptions {
  widthMm?: number; marginMm?: number; matte?: CSSHexColor;
  title?:string; description?:string; quality?:number;
}
export interface QRExportOptions {
  format?: ImageFormat;
  style?: QRStyleOptions;
  quality?: number;
  /** Opaque RGB hex used to flatten alpha for JPEG, default #ffffff. */
  jpegMatte?: CSSHexColor;
  printOptions?: QRPrintOptions;
  animationOptions?: APNGOptions;
}
export interface QRDownloadOptions extends QRExportOptions { filename?: string; }
export declare const DEFAULT_ENCODING: Readonly<Required<EncodeOptions>>;
export declare const DEFAULT_STYLE: Readonly<Required<QRStyleOptions>>;
export declare const IMAGE_TARGETS: readonly QRImageTarget[];
export declare const SHADOW_TARGETS: readonly QRShadowTarget[];
export declare function validateImageDataUrl(dataUrl: string): string;
export declare function normalizeImages(images?: Partial<Record<QRImageTarget, QRImageLayer>> | null): Readonly<Partial<Record<QRImageTarget, QRImageLayer>>> | null;
export declare function normalizeShadows(shadows?: Partial<Record<QRShadowTarget, QRShadow>> | null): Readonly<Partial<Record<QRShadowTarget, QRShadow>>> | null;
export declare const PAINT_AREAS: readonly QRPaintArea[];
export declare const RMQR_VERSIONS: Readonly<Record<string, { readonly width: number; readonly height: number }>>;
export declare const ROLES: Readonly<Record<string, number>>;
export declare const ROLE_NAMES: readonly QRRole[];
export declare class QREngineError extends Error {
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown);
}
export declare function encodeQR(input: string | Uint8Array | ArrayBuffer | readonly QRSegmentInput[], options?: EncodeOptions): QRCodeResult;
export declare function encodeMicroQR(input: string, options?: MicroEncodeOptions): QRCodeResult;
export declare function encodeRMQR(input: string, options?: RMQREncodeOptions): QRCodeResult;
export declare function generateQR(input: string | Uint8Array | ArrayBuffer | readonly QRSegmentInput[], options?: EncodeOptions & { kind?: 'standard' }): QRCodeResult;
export declare function generateQR(input: string, options: MicroEncodeOptions & { kind: 'micro' }): QRCodeResult;
export declare function generateQR(input: string, options: RMQREncodeOptions & { kind: 'rmqr' }): QRCodeResult;
export declare function renderSVG(qr: QRCodeResult, style?: QRStyleOptions): string;
/** Animated SVG with a stable QR matrix, using SMIL. */
export declare function renderAnimatedSVG(qr: QRCodeResult, style?: QRStyleOptions): string;
/** Deterministic non-animated frame at a time position, for verification or static snapshots. */
export declare function renderAnimationFrameSVG(qr: QRCodeResult, style?: QRStyleOptions, timeSeconds?: number): string;
export declare function normalizeStyle(style?: QRStyleOptions): Readonly<Required<QRStyleOptions>>;
export declare function normalizePaint(paint: QRPaint, name?: string): QRPaint;
export declare function analyzeDesign(qr: QRCodeResult, style?: QRStyleOptions): QRWarning[];
/** Print-oriented physical SVG with mm width and metadata. */
export declare function renderPrintSVG(qr:QRCodeResult,options?:{
  style?:QRStyleOptions;widthMm?:number;title?:string;description?:string;
}):string;
/** Lossless rasterized PDF, JPEG-containing EPS, or physical SVG. Browser-only for PDF/EPS. */
export declare function toPrintBlob(qr:QRCodeResult, options?:{
  format?:'pdf'|'eps'|'svg';style?:QRStyleOptions;
} & QRPrintOptions):Promise<Blob>;
/** Split one message across 2–16 Standard QR symbols, or return one when auto fits. */
export declare function encodeStructuredAppend(input:string|Uint8Array|ArrayBuffer,options?:{
  kind?:'standard';symbolCount?:'auto'|number;
} & EncodeOptions):{
  symbols:readonly QRCodeResult[];
  records:readonly QRBatchRow[];
  metadata:Readonly<{count:number;parity:number;structuredAppend:boolean}>;
  warnings:readonly QRWarning[];
};
/** Dynamic-programming mode plan for Standard QR automatic encoding. */
export declare function planOptimizedSegments(text:string,options?:{charset?:CharacterSet;version?:number;enableHanzi?:boolean}):
  readonly QRSegmentInput[] | null;
export declare function toSVGBlob(qr: QRCodeResult, style?: QRStyleOptions): Blob;
/** Lossless browser-generated APNG, preserving QR transparent pixels. */
export declare function toAPNGBlob(qr:QRCodeResult,style?:QRStyleOptions,options?:APNGOptions):Promise<Blob>;
/** Package matching PNG ArrayBuffers as an APNG. */
export declare function muxAPNG(pngFiles:ArrayBuffer[],delays:number[]):Blob;
export declare function toCanvas(qr: QRCodeResult, style?: QRStyleOptions, options?: {frameTime?:number|null}): Promise<HTMLCanvasElement>;
export declare function toBlob(qr: QRCodeResult, options?: QRExportOptions): Promise<Blob>;
export declare function prepareFilename(filename?: string, format?: ImageFormat, date?: Date): string;
export declare function downloadQR(qr: QRCodeResult, options?: QRDownloadOptions): Promise<void>;
export declare function readLogoFile(file: File): Promise<string>;
export declare const readImageFile: typeof readLogoFile;
export declare function removeLightBackground(dataUrl: string, threshold?: number): Promise<string>;
export interface QRBatchRow {
  data: string | Uint8Array | readonly QRSegmentInput[];
  filename?: string;
  kind?: QRKind;
  encoding?: EncodeOptions | MicroEncodeOptions | RMQREncodeOptions;
  style?: QRStyleOptions;
  format?: ImageFormat;
}
export type QRBatchInput = string | QRBatchRow;
export type QRBatchResult = {
  index: number; ok: true; filename: string; blob: Blob; metadata: QRMetadata; warnings: QRWarning[];
} | {index: number; ok: false; error: {code: string; message: string}};
export interface QRBatchOptions extends QRExportOptions {
  kind?: QRKind;
  encoding?: EncodeOptions | MicroEncodeOptions | RMQREncodeOptions;
  signal?: AbortSignal;
  onProgress?: (progress: {completed: number; success: number; failed: number}) => void;
  stopOnError?: boolean;
  yieldEvery?: number;
  maxRecords?: number;
}
/** Streams results with bounded working memory. Caller consumes / writes each Blob. */
export declare function iterateBatch(records: Iterable<QRBatchInput> | AsyncIterable<QRBatchInput>, options?: QRBatchOptions): AsyncGenerator<QRBatchResult>;
/** Convenience result collector; use iterateBatch for large workloads. */
export declare function generateBatch(records: Iterable<QRBatchInput> | AsyncIterable<QRBatchInput>, options?: QRBatchOptions): Promise<{results: QRBatchResult[]; success: number; failed: number}>;
export declare const payloads: Readonly<{
  text(text: unknown): string;
  url(url: string): string;
  wifi(options: { ssid: string; password?: string; security?: 'WPA' | 'WEP' | 'nopass'; hidden?: boolean }): string;
  email(options: { to: string; subject?: string; body?: string }): string;
  sms(options: { to: string; message?: string }): string;
  telephone(number: string): string;
  geo(options: { latitude: number; longitude: number; altitude?: number }): string;
  vcard(options: { firstName?: string; lastName?: string; fullName?: string; organization?: string; title?: string; phone?: string; email?: string; url?: string; note?: string }): string;
  mecard(options: { name: string; phone?: string; email?: string; url?: string }): string;
}>;

/** Parse CSV/TSV into rectangular arrays, preserving quoted newlines and escaped quotes. */
export declare function parseDelimited(text: string, options?: {delimiter?: ',' | ';' | '\t'; maxRows?: number; maxColumns?: number; maxChars?: number}): string[][];
/** Map named columns or numeric positions into the canonical batch row model. */
export declare function mapBatchColumns(table: string[][], options?: {headers?: boolean; columns?: Partial<Record<'data' | 'filename' | 'kind' | 'format' | 'encoding' | 'style', string | number>>; maxRecords?: number}): QRBatchRow[];
export declare function generateSequence(options?: {start?: number;end?: number;step?: number;pad?: number;template?: string;filename?: string}): QRBatchRow[];
export declare function serializeManifest(rows: Array<{index:number;ok:boolean;filename?:string;metadata?:QRMetadata;error?:{code:string;message:string};data?:string}>, options?:{includeData?:boolean}): string;
export interface QRBatchZipOptions extends QRBatchOptions {
  /** When provided, bytes are streamed to disk without retaining the ZIP Blob. */
  writable?: WritableStream<Uint8Array> | {write(data:Uint8Array):Promise<void>;close?():Promise<void>;abort?(error?:unknown):Promise<void>} | null;
  includeManifest?: boolean;
  manifestIncludeData?: boolean;
  maxBytes?: number;
  now?: Date;
  onResult?: (result: QRBatchResult) => void;
}
export declare function createBatchZip(records: Iterable<QRBatchInput> | AsyncIterable<QRBatchInput>, options?: QRBatchZipOptions): Promise<{
  blob:Blob|null;entries:Array<{filename:string;size:number;crc:number}>;success:number;failed:number;bytes:number;
}>;
export declare function extractPalette(imageData: ImageData, options?: {count?:number}): string[];
export declare function extractImagePalette(dataUrl:string, options?:{count?:number}): Promise<string[]>;
export interface RasterContrast {
  score:'strong'|'moderate'|'weak';contrastRatio:number;contrastGap:number;centerMatch:number;dark95:number;light05:number;examined:number;matte:string;note:string;
}
/** Samples rendered module centers; NOT a real QR decoder. */
export declare function sampleRasterContrast(qr:QRCodeResult,pixels:ImageData,options?:{quietZone?:number;matte?:CSSHexColor}): RasterContrast;
export declare function decodeWithBrowser(canvas:HTMLCanvasElement,expected:string):Promise<{available:boolean;matched:boolean|null;detected?:number;message:string}>;
export declare function packDesign(document:object):{format:'qr-studio-document';version:4;assets:Record<string,string>;document:object};
export declare function unpackDesign(payload:unknown):object;

/** Reads back Standard QR data from known-location rendered pixels, verifies RS parity;
 * not a general image barcode reader and does not correct damaged blocks. */
export declare function verifyStandardQRBitmap(qr:QRCodeResult,pixels:ImageData,options?:{quietZone?:number;matte?:CSSHexColor;expected?:string}):{
  available:boolean;matched:boolean|null;payload?:string;parityValid?:boolean;threshold?:number;message:string;
};
