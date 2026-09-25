import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

const fontPath = (fileName: string) => path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "noto-sans",
  "files",
  fileName,
);

const FONT_PATHS = {
  regular: {
    latin: fontPath("noto-sans-latin-400-normal.woff"),
    cyrillic: fontPath("noto-sans-cyrillic-400-normal.woff"),
    cyrillicExt: fontPath("noto-sans-cyrillic-ext-400-normal.woff"),
  },
  bold: {
    latin: fontPath("noto-sans-latin-700-normal.woff"),
    cyrillic: fontPath("noto-sans-cyrillic-700-normal.woff"),
    cyrillicExt: fontPath("noto-sans-cyrillic-ext-700-normal.woff"),
  },
} as const;

type FontSet = {
  latin: PDFFont;
  cyrillic: PDFFont;
  cyrillicExt: PDFFont;
};

type PdfFonts = { regular: FontSet; bold: FontSet };

const fontCharacterSets = new WeakMap<PDFFont, Set<number>>();

export type PatientDocumentPdfInput = {
  organizationName: string;
  patientName: string;
  documentNumber: string;
  title: string;
  body: string;
  createdAt: Date;
  locale?: string;
  timeZone?: string;
  showPatientSignatureLine?: boolean;
  signed?: { name: string; at: Date };
};

let fontBytesPromise: Promise<Record<string, Uint8Array>> | undefined;

function loadFontBytes() {
  fontBytesPromise ??= Promise.all(
    Object.entries({
      regularLatin: FONT_PATHS.regular.latin,
      regularCyrillic: FONT_PATHS.regular.cyrillic,
      regularCyrillicExt: FONT_PATHS.regular.cyrillicExt,
      boldLatin: FONT_PATHS.bold.latin,
      boldCyrillic: FONT_PATHS.bold.cyrillic,
      boldCyrillicExt: FONT_PATHS.bold.cyrillicExt,
    }).map(async ([key, path]) => [key, new Uint8Array(await readFile(path))] as const),
  ).then((entries) => Object.fromEntries(entries));
  return fontBytesPromise;
}

async function embedFonts(pdf: PDFDocument): Promise<PdfFonts> {
  pdf.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const [regularLatin, regularCyrillic, regularCyrillicExt, boldLatin, boldCyrillic, boldCyrillicExt] = await Promise.all([
    pdf.embedFont(bytes.regularLatin, { subset: true }),
    pdf.embedFont(bytes.regularCyrillic, { subset: true }),
    pdf.embedFont(bytes.regularCyrillicExt, { subset: true }),
    pdf.embedFont(bytes.boldLatin, { subset: true }),
    pdf.embedFont(bytes.boldCyrillic, { subset: true }),
    pdf.embedFont(bytes.boldCyrillicExt, { subset: true }),
  ]);
  return {
    regular: { latin: regularLatin, cyrillic: regularCyrillic, cyrillicExt: regularCyrillicExt },
    bold: { latin: boldLatin, cyrillic: boldCyrillic, cyrillicExt: boldCyrillicExt },
  };
}

function normalizePdfText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, "    ");
}

function fontForCharacter(character: string, fonts: FontSet) {
  for (const font of [fonts.latin, fonts.cyrillic, fonts.cyrillicExt]) {
    let characterSet = fontCharacterSets.get(font);
    if (!characterSet) {
      characterSet = new Set(font.getCharacterSet());
      fontCharacterSets.set(font, characterSet);
    }
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && characterSet.has(codePoint)) return font;
  }
  return fonts.latin;
}

function supportedCharacter(character: string, fonts: FontSet) {
  const codePoint = character.codePointAt(0);
  for (const font of [fonts.latin, fonts.cyrillic, fonts.cyrillicExt]) {
    let characterSet = fontCharacterSets.get(font);
    if (!characterSet) {
      characterSet = new Set(font.getCharacterSet());
      fontCharacterSets.set(font, characterSet);
    }
    if (codePoint !== undefined && characterSet.has(codePoint)) return character;
  }
  return "?";
}

function textWidth(text: string, size: number, fonts: FontSet) {
  return [...text].reduce((width, character) => {
    const safeCharacter = supportedCharacter(character, fonts);
    return width + fontForCharacter(safeCharacter, fonts).widthOfTextAtSize(safeCharacter, size);
  }, 0);
}

function wrapLine(text: string, maxWidth: number, size: number, fonts: FontSet) {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size, fonts) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (textWidth(word, size, fonts) <= maxWidth) {
      current = word;
      continue;
    }
    let fragment = "";
    for (const character of word) {
      if (fragment && textWidth(fragment + character, size, fonts) > maxWidth) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment += character;
      }
    }
    current = fragment;
  }
  if (current) lines.push(current);
  return lines;
}

function drawMixedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  fonts: FontSet,
  color = rgb(0.12, 0.18, 0.17),
) {
  let cursor = x;
  let run = "";
  let runFont: PDFFont | undefined;
  const flush = () => {
    if (!run || !runFont) return;
    page.drawText(run, { x: cursor, y, size, font: runFont, color });
    cursor += runFont.widthOfTextAtSize(run, size);
    run = "";
  };
  for (const originalCharacter of text) {
    const character = supportedCharacter(originalCharacter, fonts);
    const characterFont = fontForCharacter(character, fonts);
    if (runFont && characterFont !== runFont) flush();
    runFont = characterFont;
    run += character;
  }
  flush();
}

export async function renderPatientDocumentPdf(input: PatientDocumentPdfInput) {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  pdf.setTitle(input.title);
  pdf.setAuthor(input.organizationName);
  pdf.setSubject(`Документ пациента ${input.patientName}`);
  pdf.setCreator("Dental OS");
  pdf.setProducer("Dental OS / pdf-lib");
  pdf.setCreationDate(input.createdAt);
  pdf.setModificationDate(input.signed?.at ?? input.createdAt);

  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 54;
  const contentWidth = pageSize[0] - margin * 2;
  const bodySize = 10.5;
  const bodyLineHeight = 16;
  const bottomLimit = 68;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const addPage = () => {
    page = pdf.addPage(pageSize);
    y = pageSize[1] - margin;
  };
  const ensureSpace = (height: number) => {
    if (y - height < bottomLimit) addPage();
  };

  drawMixedText(page, normalizePdfText(input.organizationName), margin, y, 10, fonts.bold, rgb(0.03, 0.42, 0.35));
  drawMixedText(page, normalizePdfText(input.documentNumber), pageSize[0] - margin - textWidth(input.documentNumber, 9, fonts.regular), y, 9, fonts.regular, rgb(0.38, 0.45, 0.43));
  y -= 18;
  page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 1, color: rgb(0.84, 0.89, 0.88) });
  y -= 34;

  const title = normalizePdfText(input.title);
  for (const line of wrapLine(title, contentWidth, 18, fonts.bold)) {
    ensureSpace(25);
    const width = textWidth(line, 18, fonts.bold);
    drawMixedText(page, line, margin + Math.max(0, (contentWidth - width) / 2), y, 18, fonts.bold);
    y -= 25;
  }
  y -= 16;

  const normalizedBody = normalizePdfText(input.body);
  for (const paragraph of normalizedBody.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      y -= 10;
      continue;
    }
    for (const line of wrapLine(paragraph, contentWidth, bodySize, fonts.regular)) {
      ensureSpace(bodyLineHeight);
      drawMixedText(page, line, margin, y, bodySize, fonts.regular);
      y -= bodyLineHeight;
    }
    y -= 5;
  }

  if (input.signed) {
    ensureSpace(86);
    y -= 10;
    page.drawRectangle({ x: margin, y: y - 62, width: contentWidth, height: 62, color: rgb(0.94, 0.98, 0.97), borderColor: rgb(0.62, 0.82, 0.77), borderWidth: 1 });
    drawMixedText(page, "Подписано пациентом", margin + 14, y - 20, 10, fonts.bold, rgb(0.03, 0.42, 0.35));
    drawMixedText(page, normalizePdfText(input.signed.name), margin + 14, y - 39, 10, fonts.regular);
    const signedDate = new Intl.DateTimeFormat(input.locale ?? "ru-RU", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: input.timeZone ?? "Asia/Almaty",
    }).format(input.signed.at);
    drawMixedText(page, normalizePdfText(signedDate), margin + 14, y - 54, 8.5, fonts.regular, rgb(0.38, 0.45, 0.43));
    y -= 76;
  } else if (input.showPatientSignatureLine) {
    ensureSpace(70);
    y -= 28;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + 190, y }, thickness: 0.8, color: rgb(0.28, 0.34, 0.33) });
    page.drawLine({ start: { x: pageSize[0] - margin - 120, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.8, color: rgb(0.28, 0.34, 0.33) });
    drawMixedText(page, "ФИО и подпись пациента", margin, y - 15, 8, fonts.regular, rgb(0.38, 0.45, 0.43));
    drawMixedText(page, "Дата", pageSize[0] - margin - 120, y - 15, 8, fonts.regular, rgb(0.38, 0.45, 0.43));
  }

  const dateLabel = new Intl.DateTimeFormat(input.locale ?? "ru-RU", {
    dateStyle: "medium",
    timeZone: input.timeZone ?? "Asia/Almaty",
  }).format(input.createdAt);
  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({ start: { x: margin, y: 44 }, end: { x: pageSize[0] - margin, y: 44 }, thickness: 0.6, color: rgb(0.87, 0.9, 0.9) });
    drawMixedText(currentPage, normalizePdfText(dateLabel), margin, 28, 8, fonts.regular, rgb(0.45, 0.5, 0.49));
    const pageLabel = `${index + 1} / ${pages.length}`;
    drawMixedText(currentPage, pageLabel, pageSize[0] - margin - textWidth(pageLabel, 8, fonts.regular), 28, 8, fonts.regular, rgb(0.45, 0.5, 0.49));
  });

  return pdf.save({ useObjectStreams: false });
}
