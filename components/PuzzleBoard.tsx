import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PuzzleType } from '../App';

// --- Constants & Interfaces ---

interface PuzzleBoardProps {
  imageUrl: string;
  gridSize: number;
  isGameActive: boolean;
  mode: PuzzleType;
  rotations: number[];
  onRotationChange: (index: number) => void;
  jigsawBoard: (number | null)[];
  jigsawTray: number[];
  onJigsawDrop: (tileId: number, slotIndex: number) => void;
  onJigsawToTray: (tileId: number) => void;
}

// --- Helper Functions for Jigsaw Geometry ---

const getJigsawShape = (tileId: number, gridSize: number) => {
    const row = Math.floor(tileId / gridSize);
    const col = tileId % gridSize;
    
    // Deterministic pseudo-randomness for consistent edges
    const isTab = (val: number) => ((Math.floor(Math.abs(Math.sin(val) * 10000))) % 2 === 0) ? 1 : -1;

    const getBottom = (r: number, c: number) => (r === gridSize - 1) ? 0 : isTab(r * 29 + c * 37);
    const getRight = (r: number, c: number) => (c === gridSize - 1) ? 0 : isTab(r * 47 + c * 53 + 1000); 

    const top = row === 0 ? 0 : -getBottom(row - 1, col); 
    const bottom = getBottom(row, col);
    const left = col === 0 ? 0 : -getRight(row, col - 1); 
    const right = getRight(row, col);
  
    return { top, right, bottom, left };
};

const createJigsawPath = (shape: {top: number, right: number, bottom: number, left: number}) => {
    const mid = 50;
    const neck = 8;
    const width = 18;
    const height = 24;

    let d = `M 0 0`;

    // Top
    if (shape.top === 0) d += ` L 100 0`;
    else {
        const s = -shape.top;
        d += ` L ${mid - neck} 0`;
        d += ` C ${mid - neck} ${s*8}, ${mid - width} ${s*8}, ${mid - width} ${s*height}`;
        d += ` C ${mid - width} ${s*(height+8)}, ${mid + width} ${s*(height+8)}, ${mid + width} ${s*height}`;
        d += ` C ${mid + width} ${s*8}, ${mid + neck} ${s*8}, ${mid + neck} 0`;
        d += ` L 100 0`;
    }

    // Right
    if (shape.right === 0) d += ` L 100 100`;
    else {
        const s = shape.right;
        d += ` L 100 ${mid - neck}`;
        d += ` C ${100 + s*8} ${mid - neck}, ${100 + s*8} ${mid - width}, ${100 + s*height} ${mid - width}`;
        d += ` C ${100 + s*(height+8)} ${mid - width}, ${100 + s*(height+8)} ${mid + width}, ${100 + s*height} ${mid + width}`;
        d += ` C ${100 + s*8} ${mid + width}, ${100 + s*8} ${mid + neck}, 100 ${mid + neck}`;
        d += ` L 100 100`;
    }

    // Bottom
    if (shape.bottom === 0) d += ` L 0 100`;
    else {
        const s = shape.bottom;
        d += ` L ${mid + neck} 100`;
        d += ` C ${mid + neck} ${100 + s*8}, ${mid + width} ${100 + s*8}, ${mid + width} ${100 + s*height}`;
        d += ` C ${mid + width} ${100 + s*(height+8)}, ${mid - width} ${100 + s*(height+8)}, ${mid - width} ${100 + s*height}`;
        d += ` C ${mid - width} ${100 + s*8}, ${mid - neck} ${100 + s*8}, ${mid - neck} 100`;
        d += ` L 0 100`;
    }

    // Left
    if (shape.left === 0) d += ` L 0 0`;
    else {
        const s = -shape.left;
        d += ` L 0 ${mid + neck}`;
        d += ` C ${s*8} ${mid + neck}, ${s*8} ${mid + width}, ${s*height} ${mid + width}`;
        d += ` C ${s*(height+8)} ${mid + width}, ${s*(height+8)} ${mid - width}, ${s*height} ${mid - width}`;
        d += ` C ${s*8} ${mid - width}, ${s*8} ${mid - neck}, 0 ${mid - neck}`;
        d += ` L 0 0`;
    }

    d += " Z";
    return d;
};

// --- Sub-Components ---

interface TileContentProps {
    tileId: number;
    gridSize: number;
    imageUrl: string;
    rotation?: number;
    isShaped: boolean;
    scope?: string;
    onPointerDown?: (e: React.PointerEvent) => void;
}

const TileContent: React.FC<TileContentProps> = ({ 
    tileId, gridSize, imageUrl, rotation = 0, isShaped, scope = 'default', onPointerDown 
}) => {
    
    // 1. Square Logic
    if (!isShaped) {
        const row = Math.floor(tileId / gridSize);
        const col = tileId % gridSize;
        const step = gridSize > 1 ? 100 / (gridSize - 1) : 0;
        
        return (
            <div className="w-full h-full relative overflow-hidden bg-slate-900" 
                 style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.3s ease' }}>
                <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: `url(${imageUrl})`,
                      backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
                      backgroundPosition: `${col * step}% ${row * step}%`,
                    }}
                />
                <div className="absolute inset-0 border border-white/20 dark:border-white/10 pointer-events-none shadow-[inset_0_0_10px_rgba(0,0,0,0.1)]"></div>
            </div>
        );
    }

    // 2. Shaped Logic (SVG)
    const shape = getJigsawShape(tileId, gridSize);
    const pathData = createJigsawPath(shape);
    const row = Math.floor(tileId / gridSize);
    const col = tileId % gridSize;
    const uniqueId = `clip-${tileId}-${scope}`;

    return (
        <svg 
            viewBox="-50 -50 200 200" 
            className="w-full h-full drop-shadow-lg" 
            style={{ overflow: 'visible' }}
            onPointerDown={onPointerDown}
        >
            <defs>
                <clipPath id={uniqueId}>
                    <path d={pathData} />
                </clipPath>
            </defs>
            <g style={{ pointerEvents: 'auto', cursor: 'grab' }}>
                <g clipPath={`url(#${uniqueId})`}>
                     <image 
                        href={imageUrl} 
                        x={-col * 100} 
                        y={-row * 100} 
                        width={gridSize * 100} 
                        height={gridSize * 100} 
                        preserveAspectRatio="none"
                     />
                </g>
                <path d={pathData} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
                <path d={pathData} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" transform="translate(0.5, 0.5)"/>
            </g>
        </svg>
    );
};

// --- Main Component ---

export const PuzzleBoard: React.FC<PuzzleBoardProps> = ({ 
    imageUrl, gridSize, isGameActive, mode,
    rotations, onRotationChange,
    jigsawBoard, jigsawTray, onJigsawDrop, onJigsawToTray
}) => {
  const [dragState, setDragState] = useState<{
    tileId: number;
    width: number;
    height: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<number | null>(null);

  if (!imageUrl) return null;

  const handleAutoScroll = (clientY: number) => {
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const threshold = 100;
    const maxSpeed = 15;
    if (scrollRef.current) cancelAnimationFrame(scrollRef.current);
    const scrollStep = () => {
        let speed = 0;
        if (clientY < threshold) speed = -maxSpeed * ((threshold - clientY) / threshold);
        else if (clientY > viewportHeight - threshold) speed = maxSpeed * ((clientY - (viewportHeight - threshold)) / threshold);
        if (Math.abs(speed) > 1) {
            window.scrollBy(0, speed);
            scrollRef.current = requestAnimationFrame(scrollStep);
        }
    };
    if (clientY < threshold || clientY > viewportHeight - threshold) scrollRef.current = requestAnimationFrame(scrollStep);
  };

  const useShapedTiles = gridSize >= 4;

  const handlePointerDown = (e: React.PointerEvent, tileId: number) => {
    if (!isGameActive) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const rawOffsetX = e.clientX - rect.left;
    const rawOffsetY = e.clientY - rect.top;
    
    let startWidth, startHeight, finalOffsetX, finalOffsetY;
    if (useShapedTiles) {
        startWidth = 48;
        startHeight = 48;
        finalOffsetX = (rawOffsetX / rect.width) * startWidth;
        finalOffsetY = (rawOffsetY / rect.height) * startHeight;
    } else {
        startWidth = rect.width;
        startHeight = rect.height;
        finalOffsetX = rawOffsetX;
        finalOffsetY = rawOffsetY;
    }

    setDragState({ tileId, width: startWidth, height: startHeight, startX: e.clientX, startY: e.clientY, offsetX: finalOffsetX, offsetY: finalOffsetY });
    
    const onPointerMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        if (overlayRef.current) {
            const x = moveEvent.clientX - finalOffsetX;
            const y = moveEvent.clientY - finalOffsetY;
            overlayRef.current.style.transform = `translate(${x}px, ${y}px)`;
        }
        handleAutoScroll(moveEvent.clientY);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (scrollRef.current) cancelAnimationFrame(scrollRef.current);
        if (overlayRef.current) overlayRef.current.style.display = 'none';

        const dropX = upEvent.clientX;
        const dropY = upEvent.clientY;
        let bestSlotIndex = -1;
        let minDistance = Infinity;
        const slots = document.querySelectorAll('[data-slot-index]');
        
        slots.forEach(slot => {
            const r = slot.getBoundingClientRect();
            const centerX = r.left + r.width / 2;
            const centerY = r.top + r.height / 2;
            const dist = Math.hypot(dropX - centerX, dropY - centerY);
            if (dist < r.width * 0.7 && dist < minDistance) {
                minDistance = dist;
                bestSlotIndex = parseInt(slot.getAttribute('data-slot-index') || '-1');
            }
        });

        const targetEl = document.elementFromPoint(dropX, dropY);
        if (bestSlotIndex !== -1) onJigsawDrop(tileId, bestSlotIndex);
        else if (targetEl?.closest('[data-tray="true"]')) onJigsawToTray(tileId);
        setDragState(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
  };

  const renderTile = (tileId: number, location: 'board' | 'tray') => {
      const isDraggingThis = dragState?.tileId === tileId;
      const handleDown = (e: React.PointerEvent) => handlePointerDown(e, tileId);
      return (
        <div 
            onPointerDown={useShapedTiles ? undefined : handleDown}
            className={`touch-none select-none ${useShapedTiles ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] z-10 hover:z-50 pointer-events-none' : 'w-full h-full rounded-sm shadow-sm transition-transform cursor-grab active:cursor-grabbing'} ${isDraggingThis ? 'opacity-30' : 'opacity-100'}`}
        >
            <TileContent tileId={tileId} gridSize={gridSize} imageUrl={imageUrl} isShaped={useShapedTiles} scope={location} onPointerDown={useShapedTiles ? handleDown : undefined} />
        </div>
      );
  };
  
  if (mode === PuzzleType.ROTATE) {
    return (
        <div className="relative w-full max-w-[500px] aspect-square bg-slate-200 dark:bg-slate-800 shadow-2xl rounded-lg overflow-hidden border-4 border-slate-300 dark:border-slate-600">
            <div className="grid h-full w-full gap-1 bg-slate-300 dark:bg-slate-900 p-1" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))` }}>
                {rotations.map((rotationCount, index) => (
                    <div key={index} onClick={() => isGameActive && onRotationChange(index)} className={`relative overflow-hidden rounded-sm shadow-sm bg-slate-900 outline-none ${isGameActive ? 'cursor-pointer' : 'cursor-default'}`} style={{ WebkitTapHighlightColor: 'transparent' }}>
                        <TileContent tileId={index} gridSize={gridSize} imageUrl={imageUrl} rotation={rotationCount * 90} isShaped={false} />
                    </div>
                ))}
            </div>
        </div>
    );
  }

  return (
    <>
        <div className="flex flex-col gap-6 w-full max-w-[500px]">
            <div className="relative w-full aspect-square bg-slate-200 dark:bg-slate-800 shadow-xl rounded-lg overflow-hidden border-4 border-slate-300 dark:border-slate-600">
                <div className={`grid h-full w-full bg-slate-300 dark:bg-slate-900 ${useShapedTiles ? 'gap-0' : 'gap-1 p-1'}`} style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))` }}>
                    {jigsawBoard.map((tileId, slotIndex) => (
                        <div key={slotIndex} data-slot-index={slotIndex} className={`relative flex items-center justify-center ${tileId === null ? 'bg-slate-200/50 dark:bg-slate-800/50 border border-dashed border-slate-400 dark:border-slate-700 m-0.5 rounded-sm' : ''} ${useShapedTiles ? 'overflow-visible z-0' : 'overflow-hidden'}`}>
                            {tileId !== null ? renderTile(tileId, 'board') : <div className="text-slate-400 dark:text-slate-600 font-mono text-xs opacity-50 select-none pointer-events-none">{slotIndex + 1}</div>}
                        </div>
                    ))}
                </div>
            </div>

            <div className={`min-h-[140px] w-full bg-slate-100 dark:bg-slate-900/50 rounded-xl border-2 border-slate-200 dark:border-slate-700 p-4 pb-8 transition-all ${jigsawTray.length === 0 ? 'opacity-50' : 'opacity-100'}`} data-tray="true">
                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-6 text-center">
                    Puzzle Tray {jigsawTray.length === 0 && "(Empty)"}
                </div>
                <div className={`${useShapedTiles ? `grid ${gridSize === 5 ? 'grid-cols-5' : 'grid-cols-4'} w-full gap-y-12 place-items-center` : 'flex flex-wrap justify-center items-center gap-4'}`}>
                    {jigsawTray.map((tileId) => (
                        <div key={tileId} className={`relative flex items-center justify-center ${useShapedTiles ? 'w-12 h-12 md:w-14 md:h-14' : 'w-16 h-16 md:w-20 md:h-20 shadow-md bg-slate-300 dark:bg-slate-800 rounded-md overflow-hidden ring-1 ring-slate-900/10'}`}>
                            {renderTile(tileId, 'tray')}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {dragState && createPortal(
            <div ref={overlayRef} style={{ position: 'fixed', left: 0, top: 0, width: dragState.width, height: dragState.height, zIndex: 9999, pointerEvents: 'none', transform: `translate(${dragState.startX - dragState.offsetX}px, ${dragState.startY - dragState.offsetY}px)` }}>
                <div className={`${useShapedTiles ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%]' : 'w-full h-full'}`}>
                    <TileContent tileId={dragState.tileId} gridSize={gridSize} imageUrl={imageUrl} isShaped={useShapedTiles} scope="drag" />
                </div>
            </div>,
            document.body
        )}
    </>
  );
};