/**
 * Zero-dependency client-side ZIP archive creator (Store / uncompressed).
 * Instantly packages multiple video Blobs into a single .zip download in memory.
 */

// Precomputed CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function computeCRC32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(arr, offset, val) {
  arr[offset] = val & 0xff;
  arr[offset + 1] = (val >>> 8) & 0xff;
}

function writeUint32LE(arr, offset, val) {
  arr[offset] = val & 0xff;
  arr[offset + 1] = (val >>> 8) & 0xff;
  arr[offset + 2] = (val >>> 16) & 0xff;
  arr[offset + 3] = (val >>> 24) & 0xff;
}

/**
 * Creates a valid ZIP file Blob from an array of files.
 * Supports { name/filename, data/blob/url } objects.
 * @param {Array<{ name?: string, filename?: string, data?: Uint8Array | Blob, blob?: Blob, url?: string }>} fileList
 * @returns {Promise<Blob>}
 */
export async function createZipBlob(fileList) {
  const encoder = new TextEncoder();
  const fileEntries = [];

  // Convert all items to Uint8Array and compute CRC32
  for (const item of fileList) {
    let bytes;
    let rawData = item.data;
    if (!rawData && item.blob) {
      rawData = item.blob;
    }
    if (!rawData && item.url) {
      try {
        const res = await fetch(item.url);
        rawData = await res.blob();
      } catch (err) {
        console.error('Failed to fetch file for ZIP package:', item.url, err);
      }
    }

    if (rawData instanceof Uint8Array) {
      bytes = rawData;
    } else if (rawData instanceof Blob) {
      const buffer = await rawData.arrayBuffer();
      bytes = new Uint8Array(buffer);
    } else {
      continue;
    }

    const nameStr = item.name || item.filename || 'clip.mp4';
    const nameBytes = encoder.encode(nameStr);
    const crc = computeCRC32(bytes);
    fileEntries.push({
      nameBytes,
      bytes,
      crc,
      size: bytes.length,
    });
  }

  if (fileEntries.length === 0) {
    throw new Error('No valid files to package into ZIP archive.');
  }

  // Calculate total buffer size
  let totalLocalHeadersSize = 0;
  let totalCentralDirSize = 0;

  for (const entry of fileEntries) {
    totalLocalHeadersSize += 30 + entry.nameBytes.length + entry.size;
    totalCentralDirSize += 46 + entry.nameBytes.length;
  }

  const endOfCentralDirSize = 22;
  const totalZipSize = totalLocalHeadersSize + totalCentralDirSize + endOfCentralDirSize;
  const out = new Uint8Array(totalZipSize);

  let localOffset = 0;
  const centralEntries = [];

  // 1. Write Local File Headers + File Data
  for (const entry of fileEntries) {
    const headerOffset = localOffset;

    // Local Header Signature 0x04034b50
    writeUint32LE(out, localOffset, 0x04034b50);
    writeUint16LE(out, localOffset + 4, 20); // Version needed
    writeUint16LE(out, localOffset + 6, 0);  // Flags
    writeUint16LE(out, localOffset + 8, 0);  // Compression: 0 (Store)
    writeUint16LE(out, localOffset + 10, 0); // Mod time
    writeUint16LE(out, localOffset + 12, 0); // Mod date
    writeUint32LE(out, localOffset + 14, entry.crc);
    writeUint32LE(out, localOffset + 18, entry.size); // Compressed size
    writeUint32LE(out, localOffset + 22, entry.size); // Uncompressed size
    writeUint16LE(out, localOffset + 26, entry.nameBytes.length);
    writeUint16LE(out, localOffset + 28, 0); // Extra field length

    localOffset += 30;
    out.set(entry.nameBytes, localOffset);
    localOffset += entry.nameBytes.length;

    out.set(entry.bytes, localOffset);
    localOffset += entry.size;

    centralEntries.push({
      entry,
      localHeaderOffset: headerOffset,
    });
  }

  // 2. Write Central Directory Headers
  const centralDirStartOffset = localOffset;
  for (const { entry, localHeaderOffset } of centralEntries) {
    // Central Header Signature 0x02014b50
    writeUint32LE(out, localOffset, 0x02014b50);
    writeUint16LE(out, localOffset + 4, 20); // Version made by
    writeUint16LE(out, localOffset + 6, 20); // Version needed
    writeUint16LE(out, localOffset + 8, 0);  // Flags
    writeUint16LE(out, localOffset + 10, 0); // Compression: 0
    writeUint16LE(out, localOffset + 12, 0); // Mod time
    writeUint16LE(out, localOffset + 14, 0); // Mod date
    writeUint32LE(out, localOffset + 16, entry.crc);
    writeUint32LE(out, localOffset + 20, entry.size); // Compressed size
    writeUint32LE(out, localOffset + 24, entry.size); // Uncompressed size
    writeUint16LE(out, localOffset + 28, entry.nameBytes.length);
    writeUint16LE(out, localOffset + 30, 0); // Extra field length
    writeUint16LE(out, localOffset + 32, 0); // Comment length
    writeUint16LE(out, localOffset + 34, 0); // Disk start
    writeUint16LE(out, localOffset + 36, 0); // Internal attrs
    writeUint32LE(out, localOffset + 38, 0); // External attrs
    writeUint32LE(out, localOffset + 42, localHeaderOffset);

    localOffset += 46;
    out.set(entry.nameBytes, localOffset);
    localOffset += entry.nameBytes.length;
  }

  const centralDirLength = localOffset - centralDirStartOffset;

  // 3. Write End of Central Directory Record
  // Signature 0x06054b50
  writeUint32LE(out, localOffset, 0x06054b50);
  writeUint16LE(out, localOffset + 4, 0); // Disk number
  writeUint16LE(out, localOffset + 6, 0); // Disk with central dir
  writeUint16LE(out, localOffset + 8, fileEntries.length);  // Number of entries on disk
  writeUint16LE(out, localOffset + 10, fileEntries.length); // Total entries
  writeUint32LE(out, localOffset + 12, centralDirLength);
  writeUint32LE(out, localOffset + 16, centralDirStartOffset);
  writeUint16LE(out, localOffset + 20, 0); // Comment length

  return new Blob([out], { type: 'application/zip' });
}
