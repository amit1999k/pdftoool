
import { PDFDocument } from 'pdf-lib';

const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export const renderPDFPages = async (file: File) => {
  const pdfjsLib = (window as any).pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pagesData = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context!, viewport }).promise;
    
    pagesData.push({
      pageNumber: i,
      width: viewport.width,
      height: viewport.height,
      canvasUrl: canvas.toDataURL('image/png')
    });
  }
  return pagesData;
};

export const cropPDF = async (
  file: File, 
  cropBox: { x: number, y: number, width: number, height: number }, 
  targetPages: 'all' | 'current',
  currentPageIndex: number,
  viewWidth: number,
  viewHeight: number
) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();
  const applyIndices = targetPages === 'all' ? pages.map((_, i) => i) : [currentPageIndex];

  for (const idx of applyIndices) {
    const page = pages[idx];
    const { width, height } = page.getSize();
    const scaleX = width / viewWidth;
    const scaleY = height / viewHeight;
    
    const pdfX = cropBox.x * scaleX;
    const pdfY = height - (cropBox.y * scaleY) - (cropBox.height * scaleY);
    const pdfW = cropBox.width * scaleX;
    const pdfH = cropBox.height * scaleY;

    page.setCropBox(pdfX, pdfY, pdfW, pdfH);
    page.setMediaBox(pdfX, pdfY, pdfW, pdfH);
  }
  return await pdfDoc.save();
};

/**
 * Splits a PDF page into two separate pages (Shipping Label and Tax Invoice) 
 * based on a vertical anchor percentage.
 */
export const splitEcomLabel = async (file: File, anchorYPercent: number) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const newPdfDoc = await PDFDocument.create();
  
  const originalPages = pdfDoc.getPages();
  if (originalPages.length === 0) return await pdfDoc.save();
  
  const page = originalPages[0];
  const { width, height } = page.getSize();
  const splitY = height * (1 - anchorYPercent / 100);

  // First page: Shipping Label (Top part)
  const [labelPage] = await newPdfDoc.copyPages(pdfDoc, [0]);
  labelPage.setCropBox(0, splitY, width, height - splitY);
  labelPage.setMediaBox(0, splitY, width, height - splitY);
  newPdfDoc.addPage(labelPage);

  // Second page: Tax Invoice (Bottom part)
  const [invoicePage] = await newPdfDoc.copyPages(pdfDoc, [0]);
  invoicePage.setCropBox(0, 0, width, splitY);
  invoicePage.setMediaBox(0, 0, width, splitY);
  newPdfDoc.addPage(invoicePage);

  // Append remaining pages if they exist
  if (originalPages.length > 1) {
    const remainingIndices = originalPages.map((_, i) => i).slice(1);
    const otherPages = await newPdfDoc.copyPages(pdfDoc, remainingIndices);
    otherPages.forEach(p => newPdfDoc.addPage(p));
  }

  return await newPdfDoc.save();
};

/**
 * Splits a PDF page into two using fixed dimensions (e.g., for specific portal layouts).
 */
export const splitEcomLabelFixed = async (
  file: File, 
  config: { 
    label: { width: number, height: number }, 
    invoice: { width: number, height: number },
    viewWidth: number
  }
) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const newPdfDoc = await PDFDocument.create();
  
  const originalPages = pdfDoc.getPages();
  if (originalPages.length === 0) return await pdfDoc.save();
  
  const page = originalPages[0];
  const { width, height } = page.getSize();
  const scale = width / config.viewWidth;

  const labelH = config.label.height * scale;
  const invoiceH = config.invoice.height * scale;

  // Page 1: Label
  const [labelPage] = await newPdfDoc.copyPages(pdfDoc, [0]);
  labelPage.setCropBox(0, height - labelH, width, labelH);
  labelPage.setMediaBox(0, height - labelH, width, labelH);
  newPdfDoc.addPage(labelPage);

  // Page 2: Invoice
  const [invoicePage] = await newPdfDoc.copyPages(pdfDoc, [0]);
  const invoiceBottom = Math.max(0, height - labelH - invoiceH);
  invoicePage.setCropBox(0, invoiceBottom, width, invoiceH);
  invoicePage.setMediaBox(0, invoiceBottom, width, invoiceH);
  newPdfDoc.addPage(invoicePage);

  // Append remaining pages
  if (originalPages.length > 1) {
    const remainingIndices = originalPages.map((_, i) => i).slice(1);
    const otherPages = await newPdfDoc.copyPages(pdfDoc, remainingIndices);
    otherPages.forEach(p => newPdfDoc.addPage(p));
  }

  return await newPdfDoc.save();
};
