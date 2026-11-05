import React, { useState, useEffect, useRef } from 'react';
import { PuzzleBoard } from './components/PuzzleBoard';
import { MapPicker } from './components/MapPicker';
import { CalendarPicker } from './components/CalendarPicker';
import { IndexLegend } from './components/IndexLegend';
import { getBoundingBox, generateMosaic, renderLayer, getMonthlyAvailability, findRandomGoodDate } from './services/sentinelService';
import { PRESET_LOCATIONS, VISUALIZATION_MODES, VisMode } from './constants';
import { GeoLocation, MosaicData } from './types';
import { MapPin, Globe, Loader2, RotateCcw, CheckCircle2, Layers, Info, Clock, X, Eye, ChevronDown, ChevronUp, Moon, Sun, Grip, Puzzle, RotateCw, HelpCircle } from 'lucide-react';

// --- Enums & Constants ---

enum GameMode {
  RANDOM = 'RANDOM',
  CHOOSE = 'CHOOSE'
}

export enum PuzzleType {
  ROTATE = 'ROTATE',
  JIGSAW = 'JIGSAW'
}

type Difficulty = 2 | 3 | 4 | 5;

// Fixed radius in km for the puzzle area.
// 25km radius = 50km x 50km box.
const FIXED_RADIUS_KM = 25;

const App: React.FC = () => {
  // --- State: App Mode & Data ---
  const [mode, setMode] = useState<GameMode>(GameMode.RANDOM);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [mosaicData, setMosaicData] = useState<MosaicData | null>(null);
  const [currentTimeRange, setCurrentTimeRange] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(true);
  const [isHintOpen, setIsHintOpen] = useState(false);
  
  // --- State: Game Settings ---
  const [difficulty, setDifficulty] = useState<Difficulty>(4);
  const [puzzleType, setPuzzleType] = useState<PuzzleType>(PuzzleType.JIGSAW);

  // --- State: Rotate Game ---
  const [tileRotations, setTileRotations] = useState<number[]>([]);
  
  // --- State: Jigsaw Game ---
  const [jigsawBoard, setJigsawBoard] = useState<(number | null)[]>([]);
  const [jigsawTray, setJigsawTray] = useState<number[]>([]);

  // --- State: Gameplay Status ---
  const [isGameComplete, setIsGameComplete] = useState<boolean>(false);
  const [showWinModal, setShowWinModal] = useState<boolean>(false);
  
  // --- State: Location Selection ---
  const [selectedLocation, setSelectedLocation] = useState<GeoLocation | null>(null);
  const [locationName, setLocationName] = useState<string>("Unknown Location");
  const [visMode, setVisMode] = useState<VisMode>('VISUAL');

  // --- State: Calendar ---
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isCalLoading, setIsCalLoading] = useState(false);

  // --- Refs ---
  const activeOperationRef = useRef<number>(0);

  // --- Theme Management ---
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
        const savedTheme = localStorage.getItem('theme');
        return savedTheme ? savedTheme === 'dark' : true;
    }
    return true;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // --- Game Initialization Logic ---

  const initializeGame = (gridSize: number = difficulty, type: PuzzleType = puzzleType) => {
    setIsGameComplete(false);
    setShowWinModal(false);

    if (type === PuzzleType.ROTATE) {
        const newRotations = Array(gridSize * gridSize).fill(0).map(() => Math.floor(Math.random() * 4));
        if (newRotations.every(r => r % 4 === 0)) newRotations[0] = 1; 
        setTileRotations(newRotations);
    } else {
        const totalTiles = gridSize * gridSize;
        setJigsawBoard(Array(totalTiles).fill(null));
        const tiles = Array.from({ length: totalTiles }, (_, i) => i);
        
        for (let i = tiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        }
        setJigsawTray(tiles);
    }
  };

  const handleDifficultyChange = (newDifficulty: Difficulty) => {
    if (newDifficulty === difficulty) return;
    setDifficulty(newDifficulty);
    if (currentImage) initializeGame(newDifficulty, puzzleType);
  };

  const handlePuzzleTypeChange = (newType: PuzzleType) => {
    if (newType === puzzleType) return;
    setPuzzleType(newType);
    if (currentImage) initializeGame(difficulty, newType);
  };

  const handleRotationChange = (index: number) => {
    if (isGameComplete) return;

    setTileRotations(prev => {
        const next = [...prev];
        next[index] = next[index] + 1;
        if (next.every(r => r % 4 === 0)) {
            handleWin();
        }
        return next;
    });
  };

  const handleJigsawDrop = (tileId: number, targetSlotIndex: number) => {
    if (isGameComplete) return;

    const newTray = jigsawTray.filter(id => id !== tileId);
    const newBoard = [...jigsawBoard];
    
    const prevSlotIndex = newBoard.findIndex(id => id === tileId);
    if (prevSlotIndex !== -1) {
        newBoard[prevSlotIndex] = null;
    }

    const existingTileInTarget = newBoard[targetSlotIndex];
    if (existingTileInTarget !== null) {
        if (prevSlotIndex !== -1) {
            newBoard[prevSlotIndex] = existingTileInTarget;
        } else {
            newTray.push(existingTileInTarget);
        }
    }

    newBoard[targetSlotIndex] = tileId;
    setJigsawTray(newTray);
    setJigsawBoard(newBoard);

    const isWin = newBoard.every((val, index) => val === index);
    if (isWin) {
        handleWin();
    }
  };

  const handleMoveToTray = (tileId: number) => {
     if (isGameComplete) return;
     if (jigsawTray.includes(tileId)) return;
     const newBoard = jigsawBoard.map(t => t === tileId ? null : t);
     const newTray = [...jigsawTray, tileId];
     setJigsawBoard(newBoard);
     setJigsawTray(newTray);
  };

  const handleWin = () => {
    setIsGameComplete(true);
    setTimeout(() => setShowWinModal(true), 500);
  };

  const handleShowAnswer = () => {
    if (isGameComplete || !currentImage) return;

    if (puzzleType === PuzzleType.ROTATE) {
        setTileRotations(prev => prev.map(r => {
            const remainder = r % 4;
            return remainder === 0 ? r : r + (4 - remainder);
        }));
    } else {
        const solvedBoard = Array.from({ length: difficulty * difficulty }, (_, i) => i);
        setJigsawBoard(solvedBoard);
        setJigsawTray([]);
    }

    handleWin();
  };

  useEffect(() => {
    if (mode === GameMode.RANDOM && !currentImage) {
      startRandomGame();
    }
  }, [mode]);

  useEffect(() => {
    if (mode === GameMode.CHOOSE && selectedLocation) {
        fetchAvailability();
    }
  }, [mode, selectedLocation, calYear, calMonth]);

  // Which mosaic/mode the current image was rendered from, to avoid rendering twice.
  const renderedForRef = useRef<{ data: MosaicData; mode: VisMode } | null>(null);

  useEffect(() => {
    if (!mosaicData) return;
    const rendered = renderedForRef.current;
    if (rendered && rendered.data === mosaicData && rendered.mode === visMode) return;
    let cancelled = false;
    renderLayer(mosaicData, visMode).then((url) => {
      if (cancelled) { URL.revokeObjectURL(url); return; }
      renderedForRef.current = { data: mosaicData, mode: visMode };
      setCurrentImage(url);
    }).catch((e) => console.error('Failed to render layer', e));
    return () => { cancelled = true; };
  }, [visMode, mosaicData]);

  // Release the previous image's blob URL once it is no longer displayed.
  useEffect(() => {
    if (!currentImage?.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(currentImage);
  }, [currentImage]);

  const fetchAvailability = async () => {
     if (!selectedLocation) return;
     setIsCalLoading(true);
     try {
         const bbox = getBoundingBox(selectedLocation.lat, selectedLocation.lng, FIXED_RADIUS_KM);
         const dates = await getMonthlyAvailability(bbox, calYear, calMonth);
         setAvailableDates(dates);
     } catch (e) {
         console.error(e);
     } finally {
         setIsCalLoading(false);
     }
  };

  const startRandomGame = async (retryCount = 0, existingId?: number) => {
    let currentId = existingId;
    if (retryCount === 0) {
        currentId = Date.now() + Math.random();
        activeOperationRef.current = currentId;
    } else {
        if (currentId !== activeOperationRef.current) return;
    }

    if (retryCount > 3) {
        if (activeOperationRef.current === currentId) {
            setError("Could not find a location with good data after multiple attempts. Please try again.");
            setIsLoading(false);
        }
        return;
    }

    if (retryCount === 0) {
        setIsLoading(true);
        initializeGame(difficulty, puzzleType); 
        setError(null);
        setCurrentImage(null);
        setMosaicData(null);
        setCurrentTimeRange("");
    }

    try {
      const randomLoc = PRESET_LOCATIONS[Math.floor(Math.random() * PRESET_LOCATIONS.length)];
      const bbox = getBoundingBox(randomLoc.lat, randomLoc.lng, FIXED_RADIUS_KM);
      let date = await findRandomGoodDate(bbox);
      if (activeOperationRef.current !== currentId) return;
      if (!date) date = "2023-06-01";
      if (retryCount === 0) {
        setLocationName(randomLoc.name || "Random Location");
        setSelectedLocation(randomLoc);
      }
      await loadPuzzle(bbox, date);
      if (activeOperationRef.current !== currentId) return;
    } catch (err: any) {
      if (activeOperationRef.current !== currentId) return;
      if (err.message === 'INSUFFICIENT_COVERAGE') {
          setTimeout(() => startRandomGame(retryCount + 1, currentId), 500);
          return;
      }
      setError("Failed to load a random puzzle. Please try again.");
    } finally {
       if (activeOperationRef.current === currentId && !error && retryCount === 0) {
          setIsLoading(false);
       }
    }
  };

  const loadPuzzle = async (bbox: number[], date: string) => {
    try {
        const data = await generateMosaic(bbox, date, visMode);
        const url = await renderLayer(data, visMode);
        renderedForRef.current = { data, mode: visMode };
        setMosaicData(data);
        setCurrentTimeRange(data.dateString);
        setCurrentImage(url);
    } catch (e: any) {
        throw new Error(e.message || "Failed to generate mosaic");
    }
  };

  const handleDateSelect = async (date: string) => {
    if (!selectedLocation) return;
    const currentId = Date.now() + Math.random();
    activeOperationRef.current = currentId;
    setIsLoading(true);
    setError(null);
    initializeGame(difficulty, puzzleType);
    try {
      const bbox = getBoundingBox(selectedLocation.lat, selectedLocation.lng, FIXED_RADIUS_KM);
      await loadPuzzle(bbox, date);
    } catch (err: any) {
      if (activeOperationRef.current !== currentId) return;
      setError(err.message === 'INSUFFICIENT_COVERAGE' ? "Insufficient imagery coverage." : "Failed to load mosaic.");
    } finally {
      if (activeOperationRef.current === currentId) setIsLoading(false);
    }
  };

  const handleLocationSelect = (lat: number, lng: number) => {
    activeOperationRef.current = Date.now();
    setSelectedLocation({ lat, lng });
    setLocationName(`Lat: ${lat.toFixed(2)}, Lng: ${lng.toFixed(2)}`);
    setError(null); 
    setCurrentImage(null);
    setMosaicData(null);
    setIsGameComplete(false);
    setShowWinModal(false);
  };

  const handlePlayAgain = () => {
    setShowWinModal(false);
    if (mode === GameMode.RANDOM) {
      startRandomGame(0);
    } else {
      setCurrentImage(null);
      setMosaicData(null);
      setError(null);
      initializeGame(difficulty, puzzleType);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <header className="bg-slate-900 dark:bg-black text-white p-4 shadow-md md:sticky md:top-0 z-50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Globe className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">jigSAT Puzzle</h1>
              <p className="text-xs text-slate-400">Explore the world by solving satellite puzzles</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-800 dark:bg-slate-900 rounded-lg p-1">
                <button
                onClick={() => {
                    activeOperationRef.current = Date.now();
                    setMode(GameMode.RANDOM);
                    setCurrentImage(null);
                    setMosaicData(null);
                    initializeGame(difficulty, puzzleType);
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    mode === GameMode.RANDOM ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                >
                Randomize
                </button>
                <button
                onClick={() => {
                    activeOperationRef.current = Date.now();
                    setMode(GameMode.CHOOSE);
                    setCurrentImage(null);
                    setMosaicData(null);
                    initializeGame(difficulty, puzzleType);
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    mode === GameMode.CHOOSE ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                >
                Choose Location
                </button>
            </div>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 hover:bg-slate-300 dark:hover:text-white transition-colors"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {showWinModal && currentImage && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full text-center overflow-hidden flex flex-col max-h-[90vh] relative border border-slate-200 dark:border-slate-800">
              <button onClick={() => setShowWinModal(false)} className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-600 dark:text-slate-400">
                <X className="w-5 h-5" />
              </button>
              <div className="p-6 overflow-y-auto">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">Congratulations!</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-6">You've successfully reconstructed the satellite imagery for {locationName}.</p>
                <div className="relative aspect-square w-full max-w-[400px] mx-auto mb-6 rounded-lg overflow-hidden shadow-md border-2 border-slate-200 dark:border-slate-700">
                  <img src={currentImage} alt="Completed Map" className="w-full h-full object-cover" />
                </div>
                <button onClick={handlePlayAgain} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <RotateCcw className="w-5 h-5" />
                  {mode === GameMode.RANDOM ? 'Next Random Location' : 'Choose New Location'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 transition-colors">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
                <MapPin className="w-5 h-5 text-blue-500" /> Create Puzzle
              </h2>
              <div className="space-y-4">
                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <p className="text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Target</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{locationName}</p>
                  {currentTimeRange && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {currentTimeRange}</p>}
                </div>

                <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Puzzle className="w-4 h-4" /> Game Mode</label>
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                            <button onClick={() => handlePuzzleTypeChange(PuzzleType.ROTATE)} disabled={isLoading} className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${puzzleType === PuzzleType.ROTATE ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}><RotateCw className="w-3 h-3" /> Rotate</button>
                            <button onClick={() => handlePuzzleTypeChange(PuzzleType.JIGSAW)} disabled={isLoading} className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${puzzleType === PuzzleType.JIGSAW ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}><Grip className="w-3 h-3" /> Jigsaw</button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Grip className="w-4 h-4" /> Grid Size</label>
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                            {[2, 3, 4, 5].map((level) => (
                                <button key={level} onClick={() => handleDifficultyChange(level as Difficulty)} disabled={isLoading} className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${difficulty === level ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>{level}x{level}</button>
                            ))}
                        </div>
                    </div>
                </div>

                {mode === GameMode.CHOOSE && (
                  <>
                     <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="h-[300px] w-full rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700">
                            <MapPicker onLocationSelect={handleLocationSelect} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">Select Date</label>
                        {selectedLocation ? (
                            <CalendarPicker year={calYear} month={calMonth} onMonthChange={(y, m) => { setCalYear(y); setCalMonth(m); }} availableDates={availableDates} isLoading={isCalLoading} onDateSelect={handleDateSelect} />
                        ) : (
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 text-center text-sm text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700">Select location first.</div>
                        )}
                    </div>
                  </>
                )}

                {mode === GameMode.RANDOM && (
                  <button onClick={() => startRandomGame(0)} disabled={isLoading} className="w-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><RotateCcw className="w-5 h-5" /> New Random Location</>}
                  </button>
                )}
                
                {currentImage && !isGameComplete && !isLoading && (
                    <button onClick={handleShowAnswer} className="w-full bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-100 font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 border border-amber-200 dark:border-amber-800">
                        <Eye className="w-5 h-5" /> Show Answer
                    </button>
                )}
              </div>
            </div>

            {error && (
               <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-md">
                 <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
               </div>
            )}

            {puzzleType === PuzzleType.JIGSAW && currentImage && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900 overflow-hidden">
                  <button onClick={() => setIsHintOpen(!isHintOpen)} className="w-full p-4 flex justify-between items-center text-blue-900 dark:text-blue-200 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 transition-colors">
                    <h3 className="font-semibold flex items-center gap-2"><HelpCircle className="w-4 h-4" /> Reference Image</h3>
                    {isHintOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {isHintOpen && (
                    <div className="p-4 pt-0 animate-in slide-in-from-top-2 duration-200">
                      <div className="relative aspect-square w-full rounded-md overflow-hidden border border-slate-300 dark:border-slate-700">
                        <img src={currentImage} alt="Puzzle Hint" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}
              </div>
            )}
            
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900 overflow-hidden">
                <button onClick={() => setIsInstructionsOpen(!isInstructionsOpen)} className="w-full p-4 flex justify-between items-center text-blue-900 dark:text-blue-200 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 transition-colors">
                  <h3 className="font-semibold flex items-center gap-2"><Info className="w-4 h-4" /> How to Play</h3>
                  {isInstructionsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {isInstructionsOpen && (
                  <div className="p-4 pt-0 animate-in slide-in-from-top-2 duration-200">
                    <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside ml-2">
                      {puzzleType === PuzzleType.ROTATE ? (
                        <>
                          <li>The image is split into rotated tiles.</li>
                          <li>Click a tile to rotate it 90 degrees.</li>
                          <li>Align all tiles correctly.</li>
                        </>
                      ) : (
                        <>
                          <li>Drag &amp; drop tiles from the tray to the grid.</li>
                          <li>Or tap a tile, then tap a slot to place it.</li>
                          <li>Arrange them to form the full image.</li>
                          <li>You can swap tiles between slots.</li>
                        </>
                      )}
                    </ul>
                  </div>
                )}
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-col items-center justify-start min-h-[500px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full w-full bg-slate-100 dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
                <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
                <p className="text-slate-500 dark:text-slate-400 font-medium">Loading satellite puzzle...</p>
              </div>
            ) : currentImage ? (
              <div className="space-y-4 w-full flex flex-col items-center">
                 <div className="flex flex-col md:flex-row gap-6 w-full justify-center items-start">
                    <div className="flex flex-row md:flex-col gap-2 justify-center md:justify-start shrink-0">
                        {Object.values(VISUALIZATION_MODES).map((config) => (
                        <button key={config.id} onClick={() => setVisMode(config.id)} title={config.description} className={`w-12 h-12 md:w-16 md:h-16 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-1 ${visMode === config.id ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500 text-blue-800 dark:text-blue-200 shadow-md transform scale-105' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-700'}`}>
                            <Layers className="w-5 h-5 md:w-6 md:h-6" />
                            <span className="text-[10px] font-bold uppercase">{config.id === 'VISUAL' ? 'RGB' : config.id}</span>
                        </button>
                        ))}
                    </div>
                    <div className="flex flex-col items-center gap-4 w-full max-w-[500px]">
                        <PuzzleBoard imageUrl={currentImage} gridSize={difficulty} isGameActive={!isGameComplete} mode={puzzleType} rotations={tileRotations} onRotationChange={handleRotationChange} jigsawBoard={jigsawBoard} jigsawTray={jigsawTray} onJigsawDrop={handleJigsawDrop} onJigsawToTray={handleMoveToTray} />
                        {visMode !== 'VISUAL' && (
                        <IndexLegend config={VISUALIZATION_MODES[visMode]} />
                        )}
                        <p className="text-xs text-slate-400 text-center">Source: Sentinel-2 Level-2A • {currentTimeRange}</p>
                    </div>
                 </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full w-full bg-slate-100 dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
                <Globe className="w-16 h-16 text-slate-300 dark:text-slate-700 mb-4" />
                <p className="text-slate-500 dark:text-slate-400">Select a location to begin</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;