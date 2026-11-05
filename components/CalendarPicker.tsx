import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface CalendarPickerProps {
  year: number;
  month: number; // 1-12
  availableDates: string[]; // ['2023-10-01', '2023-10-05', ...]
  isLoading: boolean;
  onMonthChange: (year: number, month: number) => void;
  onDateSelect: (date: string) => void;
}

export const CalendarPicker: React.FC<CalendarPickerProps> = ({
  year,
  month,
  availableDates,
  isLoading,
  onMonthChange,
  onDateSelect
}) => {
  const [inputYear, setInputYear] = useState(year);
  const [inputMonth, setInputMonth] = useState(month);

  useEffect(() => {
    setInputYear(year);
    setInputMonth(month);
  }, [year, month]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0 = Sun

  const handlePrevMonth = () => {
    if (month === 1) onMonthChange(year - 1, 12);
    else onMonthChange(year, month - 1);
  };

  const handleNextMonth = () => {
    if (month === 12) onMonthChange(year + 1, 1);
    else onMonthChange(year, month + 1);
  };

  const handleInputChange = () => {
     let y = inputYear;
     let m = inputMonth;
     if (m < 1) m = 1;
     if (m > 12) m = 12;
     if (y < 2015) y = 2015; // Sentinel-2 launch approx
     const currentYear = new Date().getFullYear();
     if (y > currentYear) y = currentYear;
     
     if (y !== year || m !== month) {
        onMonthChange(y, m);
     }
  };

  const renderDays = () => {
    const days = [];
    // Padding for empty start days
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`pad-${i}`} className="h-10 w-10" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isAvailable = availableDates.includes(dateStr);

      days.push(
        <button
          key={d}
          disabled={!isAvailable}
          onClick={() => onDateSelect(dateStr)}
          className={`
            h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-all relative
            ${isAvailable 
                ? 'hover:bg-blue-100 dark:hover:bg-blue-900/50 text-slate-900 dark:text-slate-100 cursor-pointer font-bold' 
                : 'text-slate-300 dark:text-slate-600 cursor-default'}
          `}
        >
          {d}
          {isAvailable && (
             <span className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-green-500 rounded-full"></span>
          )}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm w-full transition-colors">
      <div className="flex justify-between items-center mb-4">
        <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
            <ChevronLeft className="w-5 h-5" />
        </button>
        
        <div className="flex gap-2 items-center">
            <input 
                type="number"
                value={inputMonth}
                onChange={(e) => setInputMonth(parseInt(e.target.value) || 1)}
                onBlur={handleInputChange}
                className="w-12 text-center border border-slate-300 dark:border-slate-600 rounded p-1 text-sm font-semibold bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                min={1} max={12}
            />
            <span className="text-slate-400">/</span>
            <input 
                type="number"
                value={inputYear}
                onChange={(e) => setInputYear(parseInt(e.target.value) || 2023)}
                onBlur={handleInputChange}
                className="w-20 text-center border border-slate-300 dark:border-slate-600 rounded p-1 text-sm font-semibold bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                min={2015} max={2100}
            />
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-500 ml-2" />}
        </div>

        <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
            <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {['S','M','T','W','T','F','S'].map((day, i) => (
            <div key={i} className="text-xs text-slate-400 font-bold">{day}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1 place-items-center">
        {renderDays()}
      </div>
      
      <div className="mt-4 flex items-center gap-2 justify-center text-xs text-slate-500 dark:text-slate-400">
         <span className="w-2 h-2 bg-green-500 rounded-full"></span>
         <span>Imagery Available</span>
      </div>
    </div>
  );
};