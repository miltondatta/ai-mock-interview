import { inflateRawSync } from "zlib";

// Minimal DOCX to plain-text reader for the profile resume import. A .docx is
// a ZIP archive whose body text lives in word/document.xml. This reads that
// one entry with Node's built-in zlib, so no new dependency is needed.
// Formatting, tables and images are flattened or dropped, which is fine for
// AI field extraction.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_XML_BYTES = 20 * 1024 * 1024; // zip-bomb guard

export class DocxReadError extends Error {}

export function isDocxBuffer(buf: Buffer): boolean {
    return buf.length > 4 && buf.readUInt32LE(0) === LOCAL_SIGNATURE;
}

function findEndOfCentralDirectory(buf: Buffer): number {
    // The EOCD record is at least 22 bytes and may be followed by a comment of
    // up to 65535 bytes.
    const stop = Math.max(0, buf.length - 22 - 0xffff);
    for (let i = buf.length - 22; i >= stop; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
    }
    throw new DocxReadError("This file isn't a valid DOCX document.");
}

function readEntry(buf: Buffer, wanted: string): Buffer | null {
    const eocd = findEndOfCentralDirectory(buf);
    const entryCount = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);

    for (let i = 0; i < entryCount; i++) {
        if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
        const method = buf.readUInt16LE(offset + 10);
        const compressedSize = buf.readUInt32LE(offset + 20);
        const uncompressedSize = buf.readUInt32LE(offset + 24);
        const nameLength = buf.readUInt16LE(offset + 28);
        const extraLength = buf.readUInt16LE(offset + 30);
        const commentLength = buf.readUInt16LE(offset + 32);
        const localOffset = buf.readUInt32LE(offset + 42);
        const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);

        if (name === wanted) {
            if (uncompressedSize > MAX_XML_BYTES) throw new DocxReadError("This DOCX document is too large to read.");
            if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
                throw new DocxReadError("This file isn't a valid DOCX document.");
            }
            const localNameLength = buf.readUInt16LE(localOffset + 26);
            const localExtraLength = buf.readUInt16LE(localOffset + 28);
            const start = localOffset + 30 + localNameLength + localExtraLength;
            const data = buf.subarray(start, start + compressedSize);
            if (method === 0) return data;
            if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES });
            throw new DocxReadError("This DOCX document uses an unsupported compression method.");
        }
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return null;
}

function decodeXmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&amp;/g, "&");
}

export function docxToText(buf: Buffer): string {
    let xml: Buffer | null;
    try {
        xml = readEntry(buf, "word/document.xml");
    } catch (e) {
        if (e instanceof DocxReadError) throw e;
        throw new DocxReadError("This DOCX document couldn't be read.");
    }
    if (!xml) throw new DocxReadError("This file isn't a valid DOCX document.");

    const text = xml
        .toString("utf8")
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:(br|cr)\/>/g, "\n")
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "");
    return decodeXmlEntities(text)
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
