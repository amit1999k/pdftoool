
export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PDFPageData {
  pageNumber: number;
  width: number;
  height: number;
  canvasUrl: string;
}

export interface PDFState {
  file: File | null;
  pages: PDFPageData[];
  selectedPage: number;
  cropBox: CropBox | null;
  isProcessing: boolean;
}
