export const parseDataUrl = (url: string): { mimeType: string; dataStart: number } => {
  if (!url.startsWith("data:")) {
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
