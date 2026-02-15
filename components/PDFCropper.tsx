
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CropBox } from '../types';

interface PDFCropperProps {
  imageUrl: string;
  width: number;
  height: number;
  onCropChange: (box: CropBox | null) => void;
  initialBox?: CropBox | null;
  zoom?: number;
}

const PDFCropper: React.FC<PDFCropperProps> = ({ 
  imageUrl, 
  width, 
  height, 
  onCropChange,
  initialBox,
  zoom = 1.0
}) => {
  // Box coordinates in logical units (1.0 scale)
  const [box, setBox] = useState<CropBox | null>(initialBox || null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'resize' | 'create' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track start positions for both screen mouse coords and existing box coords
  const startPos = useRef({ 
    screenX: 0, 
    screenY: 0, 
    logicalStartX: 0, 
    logicalStartY: 0,
    boxX: 0, 
    boxY: 0, 
    boxW: 0, 
    boxH: 0 
  });

  useEffect(() => {
    setBox(initialBox || null);
  }, [initialBox]);

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'resize' | 'create', handle?: string) => {
    e.stopPropagation();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const logicalX = (e.clientX - rect.left) / zoom;
    const logicalY = (e.clientY - rect.top) / zoom;

    setIsDragging(true);
    setDragType(type);
    setResizeHandle(handle || null);

    startPos.current = {
      screenX: e.clientX,
      screenY: e.clientY,
      logicalStartX: logicalX,
      logicalStartY: logicalY,
      boxX: box?.x || 0,
      boxY: box?.y || 0,
      boxW: box?.width || 0,
      boxH: box?.height || 0,
    };

    // If starting a new selection, initialize a zero-size box at the click point
    if (type === 'create') {
      const newBox = { x: logicalX, y: logicalY, width: 0, height: 0 };
      setBox(newBox);
      onCropChange(newBox);
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current || !dragType) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentLogicalX = (e.clientX - rect.left) / zoom;
    const currentLogicalY = (e.clientY - rect.top) / zoom;

    // Constrain current coords to canvas bounds
    const boundedX = Math.max(0, Math.min(width, currentLogicalX));
    const boundedY = Math.max(0, Math.min(height, currentLogicalY));

    const dx = (e.clientX - startPos.current.screenX) / zoom;
    const dy = (e.clientY - startPos.current.screenY) / zoom;

    let nextBox: CropBox | null = null;

    if (dragType === 'create') {
      // Marquee selection: allow dragging in any direction from start
      nextBox = {
        x: Math.min(startPos.current.logicalStartX, boundedX),
        y: Math.min(startPos.current.logicalStartY, boundedY),
        width: Math.abs(boundedX - startPos.current.logicalStartX),
        height: Math.abs(boundedY - startPos.current.logicalStartY),
      };
    } else if (dragType === 'move' && box) {
      nextBox = {
        ...box,
        x: Math.max(0, Math.min(width - box.width, startPos.current.boxX + dx)),
        y: Math.max(0, Math.min(height - box.height, startPos.current.boxY + dy)),
      };
    } else if (dragType === 'resize' && box) {
      nextBox = { ...box };
      if (resizeHandle?.includes('e')) nextBox.width = Math.max(5, Math.min(width - box.x, startPos.current.boxW + dx));
      if (resizeHandle?.includes('s')) nextBox.height = Math.max(5, Math.min(height - box.y, startPos.current.boxH + dy));
      if (resizeHandle?.includes('w')) {
        const delta = Math.min(startPos.current.boxW - 5, dx);
        nextBox.x = Math.max(0, startPos.current.boxX + delta);
        nextBox.width = startPos.current.boxW - delta;
      }
      if (resizeHandle?.includes('n')) {
        const delta = Math.min(startPos.current.boxH - 5, dy);
        nextBox.y = Math.max(0, startPos.current.boxH + delta);
        nextBox.height = startPos.current.boxH - delta;
      }
    }

    if (nextBox) {
      setBox(nextBox);
      onCropChange(nextBox);
    }
  }, [isDragging, dragType, resizeHandle, box, width, height, onCropChange, zoom]);

  const handleMouseUp = useCallback(() => {
    // If user just clicked without dragging in create mode, clear the tiny box
    if (dragType === 'create' && box && (box.width < 5 || box.height < 5)) {
      setBox(null);
      onCropChange(null);
    }
    setIsDragging(false);
    setDragType(null);
    setResizeHandle(null);
  }, [dragType, box, onCropChange]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const visualWidth = width * zoom;
  const visualHeight = height * zoom;

  return (
    <div 
      ref={containerRef}
      className={`relative select-none bg-white rounded-lg overflow-hidden shadow-2xl transition-shadow duration-300 ${!box ? 'cursor-crosshair' : ''}`}
      style={{ 
        width: visualWidth, 
        height: visualHeight, 
        backgroundImage: `url(${imageUrl})`, 
        backgroundSize: '100% 100%', 
        backgroundRepeat: 'no-repeat' 
      }}
      onMouseDown={(e) => !box && handleMouseDown(e, 'create')}
    >
      {/* Container level listener for starting a new box if clicking outside existing one */}
      {box && (
        <div 
          className="absolute inset-0 cursor-crosshair z-0" 
          onMouseDown={(e) => handleMouseDown(e, 'create')} 
        />
      )}

      {box && (
        <>
          {/* Overlay darkening outside crop area */}
          <div className="absolute inset-0 bg-black/40 pointer-events-none z-10" style={{
            clipPath: `polygon(
              0% 0%, 0% 100%, ${box.x * zoom}px 100%, 
              ${box.x * zoom}px ${box.y * zoom}px, ${(box.x + box.width) * zoom}px ${box.y * zoom}px, 
              ${(box.x + box.width) * zoom}px ${(box.y + box.height) * zoom}px, ${box.x * zoom}px ${(box.y + box.height) * zoom}px, 
              ${box.x * zoom}px 100%, 100% 100%, 100% 0%
            )`
          }} />

          {/* The Crop Box */}
          <div 
            className="absolute border-2 border-blue-500 cursor-move z-20 group"
            style={{ 
              left: box.x * zoom, 
              top: box.y * zoom, 
              width: box.width * zoom, 
              height: box.height * zoom 
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
          >
            {/* Selection Text Label */}
            <div className="absolute -top-6 left-0 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-t-sm font-bold shadow-sm whitespace-nowrap">
              {Math.round(box.width)} x {Math.round(box.height)} pt
            </div>

            {/* Corner Resize Handles */}
            <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 rounded-sm cursor-nw-resize shadow-sm" onMouseDown={(e) => handleMouseDown(e, 'resize', 'nw')} />
            <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 rounded-sm cursor-ne-resize shadow-sm" onMouseDown={(e) => handleMouseDown(e, 'resize', 'ne')} />
            <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 rounded-sm cursor-sw-resize shadow-sm" onMouseDown={(e) => handleMouseDown(e, 'resize', 'sw')} />
            <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 rounded-sm cursor-se-resize shadow-sm" onMouseDown={(e) => handleMouseDown(e, 'resize', 'se')} />
            
            {/* Mid-edge handles */}
            <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-blue-500 rounded-sm cursor-w-resize shadow-sm" onMouseDown={(e) => handleMouseDown(e, 'resize', 'w')} />
            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-blue-500 rounded-sm cursor-e-resize shadow-sm" onMouseDown={(e) => handleMouseDown(e, 'resize', 'e')} />
            <div className="absolute left-1/2 -top-1.5 -translate-x-1/2 w-3 h-3 bg-white border border-blue-500 rounded-sm cursor-n-resize shadow-sm" onMouseDown={(e) => handleMouseDown(e, 'resize', 'n')} />
            <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 bg-white border border-blue-500 rounded-sm cursor-s-resize shadow-sm" onMouseDown={(e) => handleMouseDown(e, 'resize', 's')} />

            {/* Rule of thirds guides */}
            <div className="absolute top-1/3 left-0 w-full h-px bg-blue-500/20" />
            <div className="absolute top-2/3 left-0 w-full h-px bg-blue-500/20" />
            <div className="absolute left-1/3 top-0 w-px h-full bg-blue-500/20" />
            <div className="absolute left-2/3 top-0 w-px h-full bg-blue-500/20" />
          </div>
        </>
      )}
    </div>
  );
};

export default PDFCropper;
