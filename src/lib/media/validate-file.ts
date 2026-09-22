import { fileTypeFromBuffer } from "file-type";

/**
 * ============================================================================
 * SERVING-PATH WARNING for whoever builds Task 17 (logo upload) -- read this
 * before wiring SVG logo uploads up to real storage.
 * ============================================================================
 * The SVG defenses in this module (see containsDangerousSvgContent below)
 * are cheap, denylist-based defense-in-depth, not full sanitization -- their
 * entire safety model rests on the assumption that an accepted SVG is only
 * ever rendered inside an `<img src="...">` (which browsers sandbox: no
 * script execution, no external fetches, no interactivity), never parsed as
 * a top-level document.
 *
 * That assumption is ALREADY CONTRADICTED by code on this branch, shipped
 * under an earlier, already-approved plan:
 * `src/lib/members/member-profile.server.ts` resolves a member's logo to a
 * direct PUBLIC URL via `supabase.storage.from("member-logos").getPublicUrl(...)`
 * (see `logoPublicUrl`), and `src/routes/members_.$slug.tsx` uses that exact
 * URL as `og:image`/`twitter:image` (falling back from the cover image, see
 * `ogImageUrl` in `member-profile.server.ts`) when a member has no cover
 * photo. A user (or a crawler, or a social-media unfurler) can navigate
 * directly to that public SVG URL. Correction from an earlier draft of this
 * comment: Supabase Storage serves the object with its real content type
 * (`image/svg+xml`), so a direct navigation is parsed by the browser's
 * strict XML/SVG parser, NOT the lenient HTML5 parser -- it does not become
 * a "top-level HTML document" the way, say, an `.html` file would. That
 * distinction matters for judging severity: several HTML5-parser-specific
 * tricks (unquoted attribute values, a `<script/onload=>`-style slash
 * separator, `<embed>`/`<object>` HTML-foreign-content breakouts) do NOT
 * apply here, because there is no lenient HTML tokenizer in this path to
 * exploit. What direct navigation DOES still do is execute any script this
 * module's denylist fails to catch, exactly as the strict XML/SVG parser
 * would: `<script>`, event-handler attributes, and SMIL-driven `href`
 * targeting (see containsDangerousSvgContent below) are all live in a
 * directly-navigated, strictly-XML-parsed SVG document, same as they would
 * be if this were somehow rendered inline. So the underlying risk (a
 * denylist bypass reaching real script execution once this is directly
 * navigable) is real and unchanged; only the specific parser -- and
 * therefore which bypass *shapes* apply -- was misstated.
 *
 * This isn't exploitable yet -- there is no logo upload path until Task 17
 * ships, so no attacker-controlled SVG can reach `member-logos` today. It
 * WILL become exploitable the moment logo upload lands unless the serving
 * path is also fixed. Whoever builds Task 17 must do one of:
 *   (a) serve SVG logos through a route that enforces safe delivery (e.g.
 *       forces `Content-Disposition: inline` is not enough by itself --
 *       needs a response that a browser will not parse as HTML even on
 *       direct navigation, such as a hardened `Content-Type` + `CSP:
 *       sandbox` on that specific route), rather than a raw public bucket
 *       URL, or
 *   (b) exclude SVG from the direct-public-URL / og:image path specifically
 *       (e.g. never use an SVG logo as `ogImageUrl`, and/or route SVG
 *       requests through something other than `getPublicUrl`), or
 *   (c) reconsider whether SVG logos should be allowed at all, given the
 *       current serving architecture.
 * `validate-file.ts` cannot fix this on its own -- it doesn't control how
 * uploaded files get served after acceptance.
 */

export type FileValidationResult =
  | { valid: true; detectedMimeType: string }
  | { valid: false; reason: string };

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB cap (spec: "cap file size").

/**
 * Which raster formats validate as "real" for this call, keyed by context.
 *
 * allowSvg doubles as the "is this the logo upload path" flag -- across
 * this module's three real call sites (this plan's Task 14/17/20),
 * allowSvg is only ever true for the logo upload and false for the general
 * photo paths (media gallery, creator upload). Spec, "Logos and assets":
 * "PNG or SVG only, transparent background, minimum 400px tall. Reject
 * JPGs at upload with a message that says why, rather than accepting and
 * looking bad. Validate the actual file signature, not the extension."
 *
 * So a genuine JPEG (verified by its real magic bytes, not by what it
 * claims to be) must be REJECTED when allowSvg is true, and accepted when
 * it's false. Getting this backwards -- accepting any JPEG signature
 * unconditionally regardless of context -- would silently defeat the
 * logo path's whole reason for existing: Task 17's planned handler
 * (`logo.server.ts`) greps this function's rejection `reason` for the
 * substring "PNG or SVG" to decide whether to show its friendly
 * "Logos must be PNG or SVG" message, so a real JPEG has to actually
 * produce that rejection, not a `valid: true` result.
 */
function allowedRasterMimeTypes(allowSvg: boolean): ReadonlySet<string> {
  return allowSvg ? new Set(["image/png"]) : new Set(["image/jpeg", "image/png"]);
}

/**
 * SVG has no fixed magic-byte signature (it's XML text) -- file-type cannot
 * detect it, so content-sniff instead. Tolerates an XML comment between the
 * `<?xml ...?>` prologue and the DOCTYPE/root element (real Adobe
 * Illustrator and Inkscape exports both emit a generator comment right
 * there -- a real member logo export was being rejected as "not a real PNG
 * or SVG file" before this), and tolerates a DOCTYPE with an internal
 * subset (`<!DOCTYPE svg [ ... ]>`) rather than bailing out on the first
 * `>` inside it -- see the comment on ENTITY_DECLARATION_PATTERN below for
 * why that specifically matters.
 *
 * This is deliberately NOT one interleaved regex (`(?:\s|<!--...-->)*`
 * repeated across several optional sections, as an earlier version of this
 * function did). That pattern is catastrophically ambiguous: when the
 * overall match ultimately fails, the engine can partition a run of
 * comments/whitespace exponentially many ways before giving up --
 * confirmed by review as a real ReDoS, ~186 bytes of `"<!---->".repeat(n)`
 * already took 357ms and roughly doubled per added comment unit, well
 * within the 2048-byte window read below, which would pin a Worker isolate
 * on a single malicious upload. The functions below instead advance a
 * single position pointer past whitespace and complete `<!-- ... -->`
 * blocks one at a time -- every step is a bounded `indexOf`/`startsWith`
 * or a fixed-length slice test, so the whole scan is strictly linear in
 * the input length with no possibility of backtracking.
 */
function skipWhitespaceAndComments(text: string, start: number): number | null {
  let i = start;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i += 1;
      continue;
    }
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end === -1) return null; // unterminated comment -- not recognizable as SVG
      i = end + 3;
      continue;
    }
    break;
  }
  return i;
}

function skipXmlProlog(text: string, i: number): number | null {
  if (!text.startsWith("<?xml", i)) return i; // no prolog present -- unchanged, not an error
  const closeAngle = text.indexOf(">", i + 5);
  if (closeAngle === -1 || text[closeAngle - 1] !== "?") return null; // truncated or malformed
  return closeAngle + 1;
}

function skipDoctype(text: string, i: number): number | null {
  if (!/^<!DOCTYPE/i.test(text.slice(i, i + 9))) return i; // no DOCTYPE -- unchanged, not an error
  let j = i + 9;
  while (j < text.length && text[j] !== "[" && text[j] !== ">") j += 1;
  if (j >= text.length) return null; // truncated
  if (text[j] === "[") {
    // Internal subset: find its closing ']' by direct search, ignoring any
    // '>' characters that may appear inside it (e.g. inside an
    // `<!ENTITY ... "...">` declaration) -- only ']' ends the subset.
    const closeBracket = text.indexOf("]", j + 1);
    if (closeBracket === -1) return null;
    j = closeBracket + 1;
  }
  const closeAngle = text.indexOf(">", j);
  return closeAngle === -1 ? null : closeAngle + 1;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 2048))
    .replace(/^\uFEFF/, "");

  let i: number | null = skipWhitespaceAndComments(head, 0);
  if (i === null) return false;
  i = skipXmlProlog(head, i);
  if (i === null) return false;
  i = skipWhitespaceAndComments(head, i);
  if (i === null) return false;
  i = skipDoctype(head, i);
  if (i === null) return false;
  i = skipWhitespaceAndComments(head, i);
  if (i === null) return false;

  return /^<svg[\s>]/i.test(head.slice(i));
}

/**
 * Decodes XML/HTML character references (`&#106;`, `&#x6a;`, `&amp;`, ...)
 * before any dangerous-content pattern runs against the text. Without this,
 * an attribute value like `href="&#106;avascript:alert(1)"` or
 * `href="javascript&#58;alert(1)"` hides the string a naive pattern is
 * looking for -- the browser decodes character references before it does
 * anything else with an attribute value, so any check that runs on the raw
 * bytes is looking at the wrong string.
 *
 * This is a single decode pass, not a loop to a fixed point, which matches
 * how a real XML/HTML parser actually behaves: character-reference decoding
 * happens once, during tokenization, and its OUTPUT is not re-scanned for
 * further references. So a double-encoded reference like `&amp;#106;`
 * decodes to the literal text `&#106;` here (the `&amp;` becomes `&`, but
 * that new `&` is not re-examined by the numeric-reference passes that
 * already ran) -- and that's not a gap, because a real browser resolves the
 * exact same input to the exact same inert literal text, not to `j`. There
 * is nothing further to decode.
 *
 * `Number.parseInt` on the captured digits can produce a code point outside
 * `String.fromCodePoint`'s valid range (0..0x10FFFF) -- e.g. `&#99999999;`
 * or `&#x7FFFFFFF;` -- which throws a `RangeError` if passed straight
 * through. Bounds-checking before calling it (rather than only checking
 * `Number.isFinite`, which a too-large-but-finite code point still
 * satisfies) avoids turning a malformed upload into an unhandled crash;
 * out-of-range references are left as their original literal text, same as
 * a reference that isn't valid at all.
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

/**
 * Cheap defense-in-depth for SVG's real attack surface, not the full
 * sanitization Phase 3 already deferred for inline rendering -- SVGs
 * validated here are still only ever served via <img src>, never inlined
 * into the page (this plan's Decision 10). This is still a denylist over
 * decoded text, not a real XML parser or sanitizer: a determined adversary
 * using a trick not enumerated here could still get past it (double-encoded
 * entities are NOT such a trick -- see decodeXmlEntities' doc comment for
 * why that one's actually inert; CDATA content inside `<style>`, and
 * `<style>` `@import`/`url()` external-resource loading, are known,
 * currently-open gaps, not addressed by this pass). What it does cover,
 * each closing a confirmed bypass of an earlier, more naive version of this
 * check:
 *
 * - DANGEROUS_ELEMENT_PATTERN is namespace-prefix-agnostic
 *   (`<svg:script>`, `<x:foreignObject xmlns:x="...svg">`, etc. all match):
 *   in XML, an element's namespace identity comes from the URI a prefix is
 *   bound to, not the prefix text itself, so anchoring on a bare `<script`
 *   only catches the single unprefixed spelling and misses every namespace
 *   trick that resolves to the same dangerous element.
 * - EVENT_HANDLER_ATTR_PATTERN catches literal `onload=`/`onerror=`/etc.
 *   written directly on a tag.
 * - SMIL_ATTRIBUTE_NAME_PATTERN catches the same event-handler outcome
 *   reached a different way: SMIL's `<set attributeName="onload"
 *   to="alert(1)"/>` (or `<animate ...>`) sets an event-handler attribute
 *   by naming it in `attributeName`, which never matches literal `on\w+=`
 *   text.
 * - ENTITY_DECLARATION_PATTERN catches a DTD `<!ENTITY ...>` declaration
 *   (XXE / entity-expansion). This is only reachable at all because
 *   looksLikeSvg above now tolerates a DOCTYPE internal subset -- the
 *   previous version's DOCTYPE pattern died on the first `>` inside
 *   `[<!ENTITY xxe SYSTEM "...">]`, so looksLikeSvg rejected the whole
 *   input before this function ever ran, and the "rejects an XXE SVG" test
 *   passed for the wrong reason (the sniffer's blanket rejection, not this
 *   pattern). Verified below that a DOCTYPE-with-internal-subset SVG that
 *   does NOT declare an entity is now accepted, and one that does is
 *   rejected specifically for the entity -- proving this pattern is live.
 * - hasUnsafeHrefValue (called separately, not part of this array) replaces
 *   a literal `/javascript:/i` substring search -- which both missed
 *   entity-encoded schemes and false-positived on ordinary prose containing
 *   the word "javascript:" anywhere in the file, e.g. inside a `<title>` --
 *   with a scheme allowlist on actual `href`/`xlink:href` attribute values:
 *   only an empty value or a same-document fragment (`#foo`) is accepted;
 *   everything else (`javascript:`, `data:`, `vbscript:`, `http(s):`, a
 *   bare relative path, ...) is rejected outright. This is intentionally
 *   broader than "just block javascript:" -- enumerating every dangerous
 *   URI scheme is a losing game, so this only allows the specific safe
 *   shapes a logo/gallery SVG plausibly needs (referencing its own
 *   in-file defs) and rejects everything else, including legitimate
 *   external links or data:-URI-embedded raster that a real design tool
 *   might emit. That's a deliberate false-positive trade-off in the safe
 *   direction, not an oversight.
 * - hasUnsafeSmilHrefTargeting closes a bypass of the two checks above,
 *   found in review: SMIL's `<animate>`/`<set>` can target `href` or
 *   `xlink:href` *indirectly* via `attributeName="href"` (or
 *   `"xlink:href"`) combined with `to=`/`values=`/`from=` carrying the
 *   actual dangerous value, e.g.
 *   `<animate attributeName="xlink:href" values="javascript:alert(1)" .../>`.
 *   Neither SMIL_ATTRIBUTE_NAME_PATTERN (which only looks for an `on...`
 *   target) nor hasUnsafeHrefValue (which only looks at literal
 *   `href=`/`xlink:href=` attributes) sees this, since the dangerous string
 *   never appears in a `href`-named attribute at all -- it's smuggled
 *   through an unrelated attribute name and only becomes a real `href`
 *   value once SMIL applies it at runtime. This is well-formed XML (unlike
 *   the HTML5-parser-quirk bypasses noted in the module-level comment
 *   above, which don't apply to a strictly-XML-parsed SVG), so it's in
 *   scope here. extractStartTags below does the (regex-free, linear-time)
 *   work of finding each element's own start-tag text so `to=`/`values=`/
 *   `from=` are only checked when they belong to the SAME element that
 *   targets `href` via `attributeName` -- not just anywhere in the
 *   document.
 */
const DANGEROUS_ELEMENT_PATTERN = /<\s*(?:[a-z0-9_.-]+:)?(?:script|foreignobject|iframe)\b/i;
const EVENT_HANDLER_ATTR_PATTERN = /\son\w+\s*=/i;
const SMIL_ATTRIBUTE_NAME_PATTERN = /attributename\s*=\s*["']?\s*on/i;
const ENTITY_DECLARATION_PATTERN = /<!entity/i;
const HREF_ATTR_PATTERN = /(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const ATTRIBUTE_NAME_TARGETS_HREF_PATTERN = /attributename\s*=\s*["']?\s*(?:[a-z0-9_.-]+:)?href\b/i;
const SMIL_VALUE_ATTR_PATTERN = /\b(?:to|values|from)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function isUnsafeReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith("#"); // empty or a same-document fragment: safe
}

function hasUnsafeHrefValue(decodedText: string): boolean {
  for (const match of decodedText.matchAll(HREF_ATTR_PATTERN)) {
    if (isUnsafeReference(match[1] ?? match[2] ?? "")) return true;
  }
  return false;
}

/**
 * Splits decoded SVG text into each element's own start-tag substring
 * (`<tag attr="..." .../>` or `<tag attr="...">`), respecting quoted
 * attribute values so a literal `>` inside a quoted value (legal,
 * unescaped, in XML attribute content) doesn't prematurely end a tag. A
 * single linear pass with no regex involved in finding tag boundaries --
 * no backtracking is possible. Comments, DOCTYPE, and processing
 * instructions are skipped rather than returned as tags.
 */
function extractStartTags(text: string): string[] {
  const tags: string[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("<", i);
    if (start === -1) break;
    if (text.startsWith("<!--", start)) {
      const end = text.indexOf("-->", start + 4);
      i = end === -1 ? text.length : end + 3;
      continue;
    }
    if (text[start + 1] === "!" || text[start + 1] === "?") {
      // DOCTYPE / CDATA / processing instruction -- not a start tag; best
      // effort, skip to the next unquoted '>'.
      const end = text.indexOf(">", start + 1);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    let j = start + 1;
    let quote: string | null = null;
    while (j < text.length) {
      const ch = text[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      j += 1;
    }
    tags.push(text.slice(start, Math.min(j + 1, text.length)));
    i = j + 1;
  }
  return tags;
}

function hasUnsafeSmilHrefTargeting(decodedText: string): boolean {
  for (const tag of extractStartTags(decodedText)) {
    if (!ATTRIBUTE_NAME_TARGETS_HREF_PATTERN.test(tag)) continue;
    for (const match of tag.matchAll(SMIL_VALUE_ATTR_PATTERN)) {
      if (isUnsafeReference(match[1] ?? match[2] ?? "")) return true;
    }
  }
  return false;
}

function containsDangerousSvgContent(bytes: Uint8Array): boolean {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const decoded = decodeXmlEntities(raw);
  return (
    DANGEROUS_ELEMENT_PATTERN.test(decoded) ||
    EVENT_HANDLER_ATTR_PATTERN.test(decoded) ||
    SMIL_ATTRIBUTE_NAME_PATTERN.test(decoded) ||
    ENTITY_DECLARATION_PATTERN.test(decoded) ||
    hasUnsafeHrefValue(decoded) ||
    hasUnsafeSmilHrefTargeting(decoded)
  );
}

export async function validateUploadedImage(params: {
  bytes: Uint8Array;
  claimedMimeType: string;
  allowSvg: boolean;
  maxBytes?: number;
}): Promise<FileValidationResult> {
  const { bytes, allowSvg, maxBytes = MAX_UPLOAD_BYTES } = params;

  if (bytes.byteLength === 0) {
    return { valid: false, reason: "The file is empty." };
  }
  if (bytes.byteLength > maxBytes) {
    return {
      valid: false,
      reason: `The file is larger than the ${Math.round(maxBytes / (1024 * 1024))}MB limit.`,
    };
  }

  const detected = await fileTypeFromBuffer(bytes);

  if (detected && allowedRasterMimeTypes(allowSvg).has(detected.mime)) {
    return { valid: true, detectedMimeType: detected.mime };
  }

  // file-type (v22) does not leave `detected` undefined for every SVG: an
  // SVG that opens with an `<?xml ...?>` prologue gets sniffed as generic
  // `application/xml`, not left undetected the way a bare `<svg ...>` is.
  // Gating this branch on strict `!detected` (as a literal reading of this
  // module's algorithm would) rejects that -- very common, since most real
  // authoring tools (Illustrator, Inkscape, Figma exports) emit the XML
  // prologue -- as "not a real PNG or SVG file". So: treat "nothing
  // detected" and "detected as generic XML" as equally eligible for SVG
  // content-sniffing; any *other* detected type (a real raster/binary
  // signature) still blocks it, since binary magic bytes can't also decode
  // as text starting with `<svg` or `<?xml`.
  const isXmlLike =
    !detected || detected.mime === "application/xml" || detected.mime === "text/xml";

  if (allowSvg && isXmlLike && looksLikeSvg(bytes)) {
    if (containsDangerousSvgContent(bytes)) {
      return {
        valid: false,
        reason: "This SVG contains scripting or active content, which isn't allowed.",
      };
    }
    return { valid: true, detectedMimeType: "image/svg+xml" };
  }

  return {
    valid: false,
    reason: allowSvg
      ? "This doesn't look like a real PNG or SVG file. Only PNG or SVG logos are accepted."
      : "This doesn't look like a real image file (its content doesn't match its extension).",
  };
}

/** PNG IHDR is always the first chunk: 8-byte signature + 4-byte length + 4-byte type + width(4) + height(4). */
export function readPngHeight(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 26) return null;
  const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  if (!isPng) return null;
  return ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
}
