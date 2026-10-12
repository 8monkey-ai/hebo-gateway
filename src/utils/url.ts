// oxlint-disable unicorn/prefer-code-point -- scheme probes compare ASCII code units

/**
 * Case-insensitive `data:` scheme test (RFC 2397). Probes code units instead of
 * slicing so multi-MB payloads are never copied, and keeps the rule in one place.
 */
export const isDataUrl = (value: string): boolean =>
  value.length >= 5 &&
  value.charCodeAt(4) === 58 /* : */ &&
  (value.charCodeAt(0) | 0x20) === 100 /* d */ &&
  (value.charCodeAt(1) | 0x20) === 97 /* a */ &&
  (value.charCodeAt(2) | 0x20) === 116 /* t */ &&
  (value.charCodeAt(3) | 0x20) === 97; /* a */

/** Longest scheme worth considering; anything beyond this is payload, not a scheme. */
const MAX_SCHEME_LENGTH = 16;

/**
 * Cheap "could this be a URL?" test: a scheme separator must appear within the first
 * few characters, and bare base64 never contains one. Scanning or `new URL()`-ing a
 * multi-MB payload just to find out costs milliseconds per request.
 */
export const hasUrlScheme = (value: string): boolean => {
  const end = Math.min(value.length, MAX_SCHEME_LENGTH + 1);
  for (let i = 0; i < end; i++) {
    if (value.charCodeAt(i) === 58 /* : */) return i > 0;
  }
  return false;
};

export const parseDataUrl = (url: string): { mimeType: string; dataStart: number } => {
  if (!isDataUrl(url)) {
    return { mimeType: "", dataStart: 0 };
  }

  const MAX_HEADER_LENGTH = 1024;
  const headerEnd = Math.min(url.length, 5 + MAX_HEADER_LENGTH);

  const comma = url.indexOf(",", 5);
  if (comma <= 5 || comma > headerEnd) {
    return { mimeType: "", dataStart: 0 };
  }

  const semi = url.indexOf(";", 5);
  const mimeEnd = semi !== -1 && semi < comma ? semi : comma;

  const mimeType = url.slice(5, mimeEnd).trim();
  if (!mimeType) {
    return { mimeType: "", dataStart: 0 };
  }

  return {
    mimeType,
    dataStart: comma + 1,
  };
};
