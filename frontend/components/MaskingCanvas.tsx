/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';

interface MaskingCanvasProps {
  imageElement: HTMLImageElement | null;
  brushSize: number;
  maskMode: 'brush' | 'eraser';
  onMaskUpdate: (dataUrl: string | null) => void;
  maskDataUrl: string | null;
  onHotspotClick: (pos: { x: number, y: number }) => void;
}

const MaskingCanvas: React.FC<MaskingCanvasProps> = ({ imageElement, brushSize, maskMode, onMaskUpdate, maskDataUrl, onHotspotClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const dragStartInfo = useRef<{ x: number; y: number; time: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (imageElement) {
      const updateSize = () => {
        const { clientWidth, clientHeight } = imageElement;
        setCanvasSize({ width: clientWidth, height: clientHeight });
      };
      updateSize();
      const resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(imageElement);
      return () => resizeObserver.disconnect();
    }
  }, [imageElement]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (maskDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = maskDataUrl;
    }
  }, [maskDataUrl, canvasSize]);

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDrawing.current = false; // Reset drawing flag, will be set to true on move
    const pos = getPointerPos(e);
    if (pos) {
        dragStartInfo.current = { x: pos.x, y: pos.y, time: Date.now() };
        lastPoint.current = pos;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStartInfo.current) return;
    
    const currentPoint = getPointerPos(e);
    if (!currentPoint) return;

    const dist = Math.hypot(currentPoint.x - dragStartInfo.current.x, currentPoint.y - dragStartInfo.current.y);
    
    // If moved more than a few pixels, it's a drag/draw operation
    if (dist > 5) {
        isDrawing.current = true;
    }
    
    if (isDrawing.current && lastPoint.current) {
      draw(lastPoint.current, currentPoint);
      lastPoint.current = currentPoint;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStartInfo.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    const wasDrawing = isDrawing.current;
    const startInfo = dragStartInfo.current;
    
    isDrawing.current = false;
    dragStartInfo.current = null;
    lastPoint.current = null;

    if (wasDrawing) {
        // This was a drag, finalize the mask
        const canvas = canvasRef.current;
        if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            onMaskUpdate(dataUrl);
        }
    } else if (startInfo) {
        // This was a click, not a drag. Fire hotspot event.
        onHotspotClick({ x: startInfo.x, y: startInfo.y });
    }
  };
  
  const draw = (start: { x: number, y: number }, end: { x: number, y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.globalCompositeOperation = maskMode === 'brush' ? 'source-over' : 'destination-out';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.closePath();
  };

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize.width}
      height={canvasSize.height}
      className="absolute top-0 left-0 w-full h-full pointer-events-auto z-20 cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ touchAction: 'none' }}
    />
  );
};

export default MaskingCanvas;
