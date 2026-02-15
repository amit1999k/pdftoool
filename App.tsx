
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  FileUp, 
  Download, 
  Scissors, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Layout, 
  FileText,
  Loader2,
  Trash2,
  Crop,
  Maximize,
  HelpCircle,
  FileSearch,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MousePointer2,
  XCircle,
  ShoppingBag,
  ChevronDown,
  Zap,
  ZapOff,
  Info
} from 'lucide-react';
import { renderPDFPages, cropPDF, splitEcomLabelFixed } from './services/pdfService';
import { detectContentBounds, findTaxInvoiceAnchor } from './services/geminiService';
import PDFCropper from './components/PDFCropper';
import { PDFPageData, CropBox } from './types';

type PortalType = 'meesho' | 'amazon' | 'flipkart' | 'none';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PDFPageData[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cropScope, setCropScope] = useState<'all' | 'current'>('all');
  const [zoom, setZoom] = useState(0.8);
  const [activePortal, setActivePortal] = useState<PortalType>('none');
  const [isPortalMenuOpen, setIsPortalMenuOpen] = useState(false);
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let selectedFile: File | undefined;
    
    if ('files' in e.target && e.target.files) {
      selectedFile = e.target.files[0];
    } else if ('dataTransfer' in e && e.dataTransfer.files) {
      e.preventDefault();
      selectedFile = e.dataTransfer.files[0];
    }

    if (selectedFile && selectedFile.type === 'application/pdf') {
      setIsProcessing(true);
      try {
        const renderedPages = await renderPDFPages(selectedFile);
        setPages(renderedPages);
        setFile(selectedFile);
        setCurrentPageIdx(0);
        setCropBox(null);

        if (isAutoPilot && activePortal !== 'none') {
          await handlePortalAutoSplit(selectedFile, renderedPages);
        }
      } catch (error) {
        console.error("Error loading PDF:", error);
        alert("Failed to load PDF. Please try another file.");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handlePortalAutoSplit = async (targetFile: File, renderedPages: PDFPageData[]) => {
    if (!targetFile || renderedPages.length === 0) return;
    setIsAnalyzing(true);
    try {
      let pdfBytes: Uint8Array;

      if (activePortal === 'meesho') {
        // Specific Meesho dimensions: Top Label 790x490, Bottom Invoice 790x360
        pdfBytes = await splitEcomLabelFixed(targetFile, {
          label: { width: 790, height: 490 },
          invoice: { width: 790, height: 360 },
          viewWidth: 800 
        });
      } else {
        const anchorYPercent = await findTaxInvoiceAnchor(renderedPages[0].canvasUrl);
        if (anchorYPercent) {
          const { splitEcomLabel } = await import('./services/pdfService');
          pdfBytes = await splitEcomLabel(targetFile, anchorYPercent);
        } else {
          throw new Error("Could not detect split point automatically.");
        }
      }

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const newFile = new File([blob], `processed_${activePortal}_${targetFile.name}`, { type: 'application/pdf' });
      
      const newRenderedPages = await renderPDFPages(newFile);
      setPages(newRenderedPages);
      setFile(newFile);
      setCropBox(null);
      setCurrentPageIdx(0);
    } catch (error) {
      console.error("Portal split error:", error);
      alert("Auto processing failed. Please adjust manually.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSmartCrop = async () => {
    if (!file) return;
    if (activePortal !== 'none') {
      await handlePortalAutoSplit(file, pages);
    } else {
      if (!pages[currentPageIdx]) return;
      setIsAnalyzing(true);
      try {
        const bounds = await detectContentBounds(pages[currentPageIdx].canvasUrl);
        if (bounds) {
          const { width, height } = pages[currentPageIdx];
          const newBox = {
            x: (bounds.x / 100) * width,
            y: (bounds.y / 100) * height,
            width: (bounds.width / 100) * width,
            height: (bounds.height / 100) * height
          };
          setCropBox(newBox);
        }
      } catch (error) {
        console.error("Smart crop error:", error);
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleDownload = async () => {
    if (!file || !cropBox || !pages[currentPageIdx]) return;
    setIsProcessing(true);
    try {
      const pdfBytes = await cropPDF(
        file,
        cropBox,
        cropScope,
        currentPageIdx,
        pages[currentPageIdx].width,
        pages[currentPageIdx].height
      );
      
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cropped_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Cropping error:", error);
      alert("Failed to crop PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPages([]);
    setCropBox(null);
    setCurrentPageIdx(0);
    setZoom(0.8);
    setActivePortal('none');
  };

  const clearSelection = () => {
    setCropBox(null);
  };

  const adjustZoom = (delta: number) => {
    setZoom(prev => Math.max(0.2, Math.min(3.0, prev + delta)));
  };

  const selectPortal = (portal: PortalType) => {
    setActivePortal(portal);
    setIsPortalMenuOpen(false);
    if (file && isAutoPilot && portal !== 'none') {
      handlePortalAutoSplit(file, pages);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-gray-800 border-b border-gray-700 py-2 px-6 text-center text-xs text-gray-400 flex items-center justify-center gap-4">
        <span>All files are processed locally in your browser for maximum privacy.</span>
        <div className="h-3 w-px bg-gray-600"></div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider">Auto Pilot</span>
          <button 
            onClick={() => setIsAutoPilot(!isAutoPilot)}
            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${isAutoPilot ? 'bg-blue-600' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isAutoPilot ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <header className="bg-[#1f2937] border-b border-gray-700 shadow-xl z-50">
        <div className="main-container flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded text-white">
              <Scissors size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">PDFResizer<span className="text-blue-500">.pro</span></span>
          </div>

          <nav className="hidden md:flex items-center">
            {['Merge', 'Split', 'Resize', 'Convert', 'Crop', 'Rotate', 'Optimize'].map((tab) => (
              <button 
                key={tab}
                onClick={() => tab.toLowerCase() === 'crop' ? setActivePortal('none') : alert(`${tab} coming soon!`)}
                className={`tool-tab ${tab.toLowerCase() === 'crop' && activePortal === 'none' ? 'active' : ''}`}
              >
                {tab} PDF
              </button>
            ))}
            
            <div className="relative">
              <button 
                onClick={() => setIsPortalMenuOpen(!isPortalMenuOpen)}
                className={`tool-tab flex items-center gap-2 ${activePortal !== 'none' ? 'active' : ''}`}
              >
                <ShoppingBag size={16} />
                <span>Ecom Portal Crop</span>
                <ChevronDown size={14} className={`transition-transform ${isPortalMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isPortalMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-[#1f2937] border border-gray-700 rounded-lg shadow-2xl py-2 z-[60]">
                  {(['meesho', 'amazon', 'flipkart'] as PortalType[]).map((portal) => (
                    <button
                      key={portal}
                      onClick={() => selectPortal(portal)}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-gray-700 ${activePortal === portal ? 'text-blue-400 bg-gray-800' : 'text-gray-300'}`}
                    >
                      {portal.charAt(0).toUpperCase() + portal.slice(1)} Label
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsAutoPilot(!isAutoPilot)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isAutoPilot ? 'bg-blue-600/20 text-blue-400 border border-blue-600/50 shadow-[0_0_15px_rgba(37,99,235,0.2)]' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}
            >
              {isAutoPilot ? <Zap size={14} className="fill-blue-400" /> : <ZapOff size={14} />}
              Auto Pilot {isAutoPilot ? 'ON' : 'OFF'}
            </button>
            <div className="h-6 w-px bg-gray-700" />
            <button className="p-2 text-gray-400 hover:text-white transition-colors">
              <HelpCircle size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#2d2d2d]">
        <div className="main-container bg-[#333] rounded-xl shadow-2xl border border-gray-700 overflow-hidden min-h-[600px] flex flex-col">
          
          {!file ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-12">
              <div className="max-w-2xl space-y-4">
                <h2 className="text-3xl font-bold text-white">
                  {activePortal !== 'none' ? `Crop ${activePortal.charAt(0).toUpperCase() + activePortal.slice(1)} Labels` : 'Crop PDF files'}
                </h2>
                <p className="text-gray-400">
                  {activePortal !== 'none' 
                    ? `Separates shipping label and tax invoice automatically. Upload your ${activePortal} label PDF.`
                    : "Visual PDF document cropping / changing canvas size. Easily crop scans, labels, logos, and any other PDFs."}
                </p>
              </div>

              <div 
                className="w-full max-w-2xl drop-zone rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer group"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileChange}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="bg-blue-600/10 p-6 rounded-full group-hover:bg-blue-600/20 transition-all mb-6">
                  {activePortal !== 'none' ? <ShoppingBag size={48} className="text-blue-500" /> : <FileUp size={48} className="text-blue-500" />}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Choose, paste or drag {activePortal !== 'none' ? `${activePortal} PDF` : 'files'} here</h3>
                <p className="text-sm text-gray-500">Maximum combined file size: 100MB</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="application/pdf" 
                  className="hidden" 
                />
                
                <button className="mt-8 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-blue-900/40 transition-all active:scale-95">
                  Select {activePortal !== 'none' ? 'Portal PDF' : 'Files'}!
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl text-left border-t border-gray-700 pt-12 mt-12">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-blue-500 font-bold text-sm">
                    <CheckCircle2 size={16} />
                    <span>Privacy First</span>
                  </div>
                  <p className="text-xs text-gray-500">Processing is done locally. Your invoice data never leaves your browser.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-purple-500 font-bold text-sm">
                    <Sparkles size={16} />
                    <span>Portal AI Detect</span>
                  </div>
                  <p className="text-xs text-gray-500">Auto-identifies the Tax Invoice separator to split labels perfectly.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-500 font-bold text-sm">
                    <Layout size={16} />
                    <span>Clean Splitting</span>
                  </div>
                  <p className="text-xs text-gray-500">Extracts label to page 1 and invoice to page 2 for easy printer management.</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-[#1f2937] border-b border-gray-700 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button onClick={reset} className="text-gray-400 hover:text-white p-2" title="Reset All">
                    <Trash2 size={20} />
                  </button>
                  <div className="h-6 w-px bg-gray-700" />
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setCurrentPageIdx(Math.max(0, currentPageIdx - 1))}
                      disabled={currentPageIdx === 0}
                      className="p-1.5 bg-[#374151] rounded hover:bg-[#4b5563] disabled:opacity-30"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="text-sm font-medium text-gray-300 min-w-[80px] text-center">
                      Page {currentPageIdx + 1} / {pages.length}
                    </span>
                    <button 
                      onClick={() => setCurrentPageIdx(Math.min(pages.length - 1, currentPageIdx + 1))}
                      disabled={currentPageIdx === pages.length - 1}
                      className="p-1.5 bg-[#374151] rounded hover:bg-[#4b5563] disabled:opacity-30"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>

                  <div className="h-6 w-px bg-gray-700" />

                  <div className="flex items-center gap-1 bg-[#2d2d2d] p-1 rounded-lg border border-gray-700">
                    <button onClick={() => adjustZoom(-0.1)} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#374151] rounded" title="Zoom Out">
                      <ZoomOut size={16} />
                    </button>
                    <button onClick={() => setZoom(1.0)} className="px-2 text-[10px] font-bold text-gray-300 hover:text-white" title="Reset Zoom">
                      {Math.round(zoom * 100)}%
                    </button>
                    <button onClick={() => adjustZoom(0.1)} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#374151] rounded" title="Zoom In">
                      <ZoomIn size={16} />
                    </button>
                  </div>

                  <div className="h-6 w-px bg-gray-700" />

                  {cropBox && (
                    <button 
                      onClick={clearSelection}
                      className="flex items-center gap-2 text-red-400 hover:text-red-300 text-xs font-bold transition-colors"
                    >
                      <XCircle size={16} />
                      Clear Selection
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-[#2d2d2d] p-1 rounded-lg border border-gray-700">
                    <button 
                      onClick={() => setCropScope('all')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        cropScope === 'all' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Apply to All
                    </button>
                    <button 
                      onClick={() => setCropScope('current')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        cropScope === 'current' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      This Page
                    </button>
                  </div>

                  <button 
                    onClick={handleSmartCrop}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-purple-900/20 hover:brightness-110 active:scale-95 disabled:opacity-50"
                  >
                    {isAnalyzing ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    <span>{activePortal !== 'none' ? 'Run Auto-Split' : 'Auto-Crop'}</span>
                  </button>

                  <button 
                    onClick={handleDownload}
                    disabled={isProcessing || !cropBox}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-900/30 hover:bg-blue-700 active:scale-95 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                    <span>Download</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                <div className="w-48 bg-[#1a1a1a] border-r border-gray-700 overflow-y-auto hidden md:block">
                  <div className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800">
                    Previews
                  </div>
                  <div className="p-3 space-y-3">
                    {pages.map((page, idx) => (
                      <div 
                        key={idx}
                        onClick={() => setCurrentPageIdx(idx)}
                        className={`cursor-pointer rounded border transition-all ${
                          currentPageIdx === idx ? 'border-blue-500 bg-blue-500/10' : 'border-transparent hover:border-gray-600'
                        }`}
                      >
                        <img src={page.canvasUrl} className="w-full h-auto" alt={`P${idx + 1}`} />
                        <div className="p-1 text-[8px] text-gray-500 text-center bg-black/40">Page {idx + 1}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-12 flex flex-col items-center bg-[#111]">
                  {!cropBox && (
                    <div className="mb-4 flex flex-col items-center gap-1 text-blue-400 text-sm font-medium animate-pulse">
                      <div className="flex items-center gap-2">
                        <MousePointer2 size={16} />
                        <span>Click and drag to select crop area</span>
                      </div>
                      {activePortal !== 'none' && !isAutoPilot && (
                        <span className="text-xs text-blue-500/60 font-normal">
                          Tip: Click Portal Info below to auto-split
                        </span>
                      )}
                    </div>
                  )}
                  {pages[currentPageIdx] && (
                    <div className="relative group transition-all duration-200">
                      <div className="absolute -inset-4 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                      <PDFCropper 
                        imageUrl={pages[currentPageIdx].canvasUrl}
                        width={pages[currentPageIdx].width}
                        height={pages[currentPageIdx].height}
                        onCropChange={setCropBox}
                        initialBox={cropBox}
                        zoom={zoom}
                      />
                    </div>
                  )}
                </div>

                <div className="w-64 bg-[#1f2937] border-l border-gray-700 p-6 hidden lg:block space-y-8">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Auto Pilot Mode</h4>
                    <button 
                      onClick={() => setIsAutoPilot(!isAutoPilot)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all border ${isAutoPilot ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40' : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'}`}
                    >
                      <div className="flex items-center gap-2">
                        {isAutoPilot ? <Zap size={18} className="fill-white" /> : <ZapOff size={18} />}
                        <span>Auto Pilot</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${isAutoPilot ? 'bg-white/30' : 'bg-gray-700'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isAutoPilot ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                    </button>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      Portal labels will be processed automatically using fixed optimal dimensions when Auto Pilot is ON.
                    </p>
                  </div>

                  <div className="space-y-4 pt-8 border-t border-gray-700">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Portal Info</h4>
                    <div className="space-y-2">
                       {activePortal !== 'none' ? (
                          <button 
                            onClick={() => handlePortalAutoSplit(file!, pages)}
                            className="w-full text-left p-3 bg-blue-600/10 rounded-lg border border-blue-500/30 hover:bg-blue-600/20 transition-all group"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs text-blue-400 font-bold uppercase tracking-wider">{activePortal} active</p>
                              <Info size={14} className="text-blue-500 group-hover:scale-110 transition-transform" />
                            </div>
                            <p className="text-[10px] text-gray-400 leading-tight">
                              {activePortal === 'meesho' 
                                ? "Auto: Label (790x490) and Invoice (790x360). Click to apply now." 
                                : "Click to auto-split label and invoice into separate pages."}
                            </p>
                          </button>
                       ) : (
                          <p className="text-[10px] text-gray-500 italic">Select a portal above to enable automated shipping label extraction.</p>
                       )}
                    </div>
                  </div>

                  <div className="space-y-4 pt-8 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Dimensions</h4>
                    </div>
                    {cropBox ? (
                      <div className="grid grid-cols-2 gap-3">
                        <CoordInput label="W" value={Math.round(cropBox.width)} />
                        <CoordInput label="H" value={Math.round(cropBox.height)} />
                        <CoordInput label="X" value={Math.round(cropBox.x)} />
                        <CoordInput label="Y" value={Math.round(cropBox.y)} />
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-600 text-xs italic">
                        No selection active
                      </div>
                    )}
                    <p className="text-[10px] text-gray-500 italic">Values shown in rendered points. High resolution maintained on export.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const CoordInput: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-center gap-2 bg-[#111] border border-gray-700 rounded-md px-2 py-1.5">
    <span className="text-[10px] font-bold text-gray-600">{label}</span>
    <span className="text-xs font-mono text-blue-400 flex-1 text-right">{value}</span>
  </div>
);

export default App;
