import React, { useEffect, useRef, useState } from 'react';
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

/**
 * Classes applied to anything the player can grab. Besides disabling scrolling
 * (`touch-action`), they stop iOS Safari from starting text selection, showing the
 * long-press "Save Image" callout, the grey tap flash, or a native image drag.
 */
const GRAB_CLASSES =
  'touch-none select-none [-webkit-user-select:none] [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] [-webkit-user-drag:none]';

interface TileContentProps {
    tileId: number;
    gridSize: number;
    imageUrl: string;
    rotation?: number;
    isShaped: boolean;
    isSelected?: boolean;
    scope?: string;
    onPointerDown?: (e: React.PointerEvent) => void;
}

const TileContent: React.FC<TileContentProps> = ({
    tileId, gridSize, imageUrl, rotation = 0, isShaped, isSelected = false, scope = 'default', onPointerDown
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
                <div className={`absolute inset-0 pointer-events-none ${isSelected ? 'ring-4 ring-inset ring-amber-400' : 'border border-white/20 dark:border-white/10 shadow-[inset_0_0_10px_rgba(0,0,0,0.1)]'}`}></div>
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
            className={`w-full h-full drop-shadow-lg ${GRAB_CLASSES}`}
            style={{ overflow: 'visible' }}
            onPointerDown={onPointerDown}
        >
            <defs>
                <clipPath id={uniqueId}>
                    <path d={pathData} />
                </clipPath>
            </defs>
            {/* The fill path is the hit area: it follows the piece outline, tabs included. */}
            <g style={{ pointerEvents: 'auto', cursor: onPointerDown ? 'grab' : undefined }}>
                <path d={pathData} fill="transparent" />
                <g clipPath={`url(#${uniqueId})`} style={{ pointerEvents: 'none' }}>
                     <image
                        href={imageUrl}
                        x={-col * 100}
                        y={-row * 100}
                        width={gridSize * 100}
                        height={gridSize * 100}
                        preserveAspectRatio="none"
                     />
                </g>
                <path d={pathData} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }}/>
                <path d={pathData} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" transform="translate(0.5, 0.5)" style={{ pointerEvents: 'none' }}/>
                {isSelected && (
                    <path d={pathData} fill="none" stroke="#fbbf24" strokeWidth="4" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }}/>
                )}
            </g>
        </svg>
    );
};

// --- Main Component ---

/** Movement (px) before a press turns into a drag; anything less is a tap. */
const DRAG_THRESHOLD = 8;

interface DragState {
  tileId: number;
  /** Size of one board slot, so the dragged piece matches the board. */
  size: number;
  /** Centre of the dragged piece. */
  x: number;
  y: number;
}

export const PuzzleBoard: React.FC<PuzzleBoardProps> = ({
    imageUrl, gridSize, isGameActive, mode,
    rotations, onRotationChange,
    jigsawBoard, jigsawTray, onJigsawDrop, onJigsawToTray
}) => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<number | null>(null);
  /** True from pointer-down on a piece until pointer-up/cancel. */
  const pressActiveRef = useRef(false);
  /** Removes the window listeners of an in-progress press (used on unmount). */
  const cleanupRef = useRef<(() => void) | null>(null);

  const useShapedTiles = gridSize >= 4;

  // Forget the selection when the puzzle changes or ends.
  useEffect(() => { setSelectedTile(null); }, [imageUrl, gridSize, mode, isGameActive]);
  useEffect(() => {
    if (selectedTile !== null && !jigsawTray.includes(selectedTile) && !jigsawBoard.includes(selectedTile)) {
      setSelectedTile(null);
    }
  }, [jigsawBoard, jigsawTray, selectedTile]);

  // iOS Safari does not reliably honour `touch-action: none` on SVG content, and
  // pointer events alone cannot stop it from scrolling the page. When the page
  // scrolls, Safari fires `pointercancel` and the drag used to freeze. Native,
  // non-passive touch listeners (registered before the touch starts, so iOS
  // knows it must wait for them) let us block scrolling while a piece is held.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mode !== PuzzleType.JIGSAW) return;
    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-piece]')) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pressActiveRef.current) e.preventDefault();
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [mode, imageUrl]);

  useEffect(() => () => {
    cleanupRef.current?.();
    if (scrollRef.current) cancelAnimationFrame(scrollRef.current);
  }, []);

  if (!imageUrl) return null;

  const stopAutoScroll = () => {
    if (scrollRef.current) cancelAnimationFrame(scrollRef.current);
    scrollRef.current = null;
  };

  const handleAutoScroll = (clientY: number) => {
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const threshold = 80;
    const maxSpeed = 15;
    stopAutoScroll();
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

  const getSlots = (): HTMLElement[] => {
    const list = containerRef.current?.querySelectorAll<HTMLElement>('[data-slot-index]');
    return list ? Array.from(list) : [];
  };

  const measureSlotSize = () => {
    const first = getSlots()[0];
    return first ? first.getBoundingClientRect().width : 64;
  };

  const findSlotAt = (x: number, y: number): number => {
    let best = -1;
    let minDistance = Infinity;
    for (const slot of getSlots()) {
      const r = slot.getBoundingClientRect();
      const dist = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (dist < r.width * 0.7 && dist < minDistance) {
        minDistance = dist;
        best = parseInt(slot.getAttribute('data-slot-index') || '-1', 10);
      }
    }
    return best;
  };

  /** Tap-to-place: tap a piece to pick it up, then tap a slot (or another piece) to place it. */
  const handleTileTap = (tileId: number) => {
    if (selectedTile === null || selectedTile === tileId) {
      setSelectedTile(selectedTile === tileId ? null : tileId);
      return;
    }
    const slotOfTapped = jigsawBoard.indexOf(tileId);
    if (slotOfTapped !== -1) {
      onJigsawDrop(selectedTile, slotOfTapped); // place (and swap) onto that slot
      setSelectedTile(null);
    } else {
      setSelectedTile(tileId); // another tray piece: switch selection
    }
  };

  const handleSlotTap = (slotIndex: number) => {
    if (!isGameActive || selectedTile === null) return;
    onJigsawDrop(selectedTile, slotIndex);
    setSelectedTile(null);
  };

  const handleTrayTap = () => {
    if (!isGameActive || selectedTile === null) return;
    if (jigsawBoard.includes(selectedTile)) onJigsawToTray(selectedTile);
    setSelectedTile(null);
  };

  const handlePointerDown = (e: React.PointerEvent, tileId: number) => {
    if (!isGameActive || !e.isPrimary || pressActiveRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const size = measureSlotSize();
    // On touch screens, float the piece above the finger so it stays visible;
    // the drop position is the piece's centre, not the finger.
    const lift = e.pointerType === 'mouse' ? 0 : size * 0.5 + 24;
    let dragging = false;
    let pos = { x: startX, y: startY - lift };

    pressActiveRef.current = true;

    const moveOverlay = () => {
      if (overlayRef.current) {
        overlayRef.current.style.transform = `translate(${pos.x - size / 2}px, ${pos.y - size / 2}px)`;
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        setSelectedTile(null);
        pos = { x: ev.clientX, y: ev.clientY - lift };
        setDragState({ tileId, size, x: pos.x, y: pos.y });
      }
      ev.preventDefault();
      pos = { x: ev.clientX, y: ev.clientY - lift };
      moveOverlay();
      handleAutoScroll(ev.clientY);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      stopAutoScroll();
      pressActiveRef.current = false;
      cleanupRef.current = null;
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      if (!dragging) {
        handleTileTap(tileId);
        return;
      }
      if (overlayRef.current) overlayRef.current.style.display = 'none';
      const slotIndex = findSlotAt(pos.x, pos.y);
      if (slotIndex !== -1) {
        onJigsawDrop(tileId, slotIndex);
      } else if (document.elementFromPoint(pos.x, pos.y)?.closest('[data-tray="true"]')) {
        onJigsawToTray(tileId);
      }
      setDragState(null);
    };

    // The browser took over the gesture (e.g. a system swipe): put the piece back.
    const onPointerCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      setDragState(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    cleanupRef.current = cleanup;
  };

  const renderTile = (tileId: number, location: 'board' | 'tray') => {
      const isDraggingThis = dragState?.tileId === tileId;
      const isSelected = selectedTile === tileId;
      const handleDown = (e: React.PointerEvent) => handlePointerDown(e, tileId);
      return (
        <div
            data-piece={tileId}
            onPointerDown={useShapedTiles ? undefined : handleDown}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            className={`${GRAB_CLASSES} ${useShapedTiles ? `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] pointer-events-none ${isSelected ? 'z-40' : 'z-10 hover:z-30'}` : `w-full h-full rounded-sm shadow-sm transition-transform cursor-grab active:cursor-grabbing ${isSelected ? 'scale-105' : ''}`} ${isDraggingThis ? 'opacity-30' : 'opacity-100'}`}
        >
            <TileContent tileId={tileId} gridSize={gridSize} imageUrl={imageUrl} isShaped={useShapedTiles} isSelected={isSelected} scope={location} onPointerDown={useShapedTiles ? handleDown : undefined} />
        </div>
      );
  };

  if (mode === PuzzleType.ROTATE) {
    return (
        <div className="relative w-full max-w-[500px] aspect-square bg-slate-200 dark:bg-slate-800 shadow-2xl rounded-lg overflow-hidden border-4 border-slate-300 dark:border-slate-600">
            <div className="grid h-full w-full gap-1 bg-slate-300 dark:bg-slate-900 p-1" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))` }}>
                {rotations.map((rotationCount, index) => (
                    // touch-action: manipulation stops iOS double-tap-to-zoom when tapping quickly.
                    <div key={index} onClick={() => isGameActive && onRotationChange(index)} className={`relative overflow-hidden rounded-sm shadow-sm bg-slate-900 outline-none touch-manipulation select-none [-webkit-user-select:none] [-webkit-touch-callout:none] ${isGameActive ? 'cursor-pointer' : 'cursor-default'}`} style={{ WebkitTapHighlightColor: 'transparent' }}>
                        <TileContent tileId={index} gridSize={gridSize} imageUrl={imageUrl} rotation={rotationCount * 90} isShaped={false} />
                    </div>
                ))}
            </div>
        </div>
    );
  }

  const hasSelection = selectedTile !== null;

  return (
    <>
        <div ref={containerRef} className="flex flex-col gap-6 w-full max-w-[500px]">
            <div className="relative w-full aspect-square bg-slate-200 dark:bg-slate-800 shadow-xl rounded-lg overflow-hidden border-4 border-slate-300 dark:border-slate-600">
                <div className={`grid h-full w-full bg-slate-300 dark:bg-slate-900 ${useShapedTiles ? 'gap-0' : 'gap-1 p-1'}`} style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))` }}>
                    {jigsawBoard.map((tileId, slotIndex) => (
                        <div
                            key={slotIndex}
                            data-slot-index={slotIndex}
                            onClick={() => handleSlotTap(slotIndex)}
                            className={`relative flex items-center justify-center touch-manipulation ${tileId === null ? `border border-dashed m-0.5 rounded-sm ${hasSelection ? 'bg-amber-100/60 dark:bg-amber-500/10 border-amber-400 cursor-pointer' : 'bg-slate-200/50 dark:bg-slate-800/50 border-slate-400 dark:border-slate-700'}` : ''} ${useShapedTiles ? 'overflow-visible z-0' : 'overflow-hidden'}`}
                        >
                            {tileId !== null ? renderTile(tileId, 'board') : <div className="text-slate-400 dark:text-slate-600 font-mono text-xs opacity-50 select-none pointer-events-none">{slotIndex + 1}</div>}
                        </div>
                    ))}
                </div>
            </div>

            <div
                onClick={handleTrayTap}
                className={`min-h-[140px] w-full bg-slate-100 dark:bg-slate-900/50 rounded-xl border-2 border-slate-200 dark:border-slate-700 p-4 pb-8 transition-all ${jigsawTray.length === 0 ? 'opacity-50' : 'opacity-100'}`}
                data-tray="true"
            >
                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-6 text-center select-none">
                    Puzzle Tray {jigsawTray.length === 0 && "(Empty)"}
                    {hasSelection && <span className="block mt-1 normal-case tracking-normal font-medium text-amber-600 dark:text-amber-400">Tap a slot to place the highlighted piece</span>}
                </div>
                <div className={`${useShapedTiles ? `grid ${gridSize === 5 ? 'grid-cols-4 sm:grid-cols-5' : 'grid-cols-3 sm:grid-cols-4'} w-full gap-y-14 place-items-center` : 'flex flex-wrap justify-center items-center gap-4'}`}>
                    {jigsawTray.map((tileId) => (
                        <div key={tileId} className={`relative flex items-center justify-center ${useShapedTiles ? 'w-14 h-14' : 'w-16 h-16 md:w-20 md:h-20 shadow-md bg-slate-300 dark:bg-slate-800 rounded-md overflow-hidden ring-1 ring-slate-900/10'}`}>
                            {renderTile(tileId, 'tray')}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {dragState && createPortal(
            <div ref={overlayRef} style={{ position: 'fixed', left: 0, top: 0, width: dragState.size, height: dragState.size, zIndex: 9999, pointerEvents: 'none', transform: `translate(${dragState.x - dragState.size / 2}px, ${dragState.y - dragState.size / 2}px)` }}>
                <div className={`${useShapedTiles ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%]' : 'w-full h-full shadow-2xl'}`}>
                    <TileContent tileId={dragState.tileId} gridSize={gridSize} imageUrl={imageUrl} isShaped={useShapedTiles} scope="drag" />
                </div>
            </div>,
            document.body
        )}
    </>
  );
};
