import React from 'react';
import { CLOUD_MASK_COLOR, VisConfig, WATER_MASK_COLOR } from '../constants';
import { stopsToCssGradient } from '../services/spectralIndices';

const formatValue = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

const Swatch: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="flex items-center gap-1">
    <span className="inline-block w-3 h-3 rounded-sm border border-slate-300 dark:border-slate-600" style={{ background: color }} />
    {label}
  </span>
);

/** Colour legend for an index view; its gradient uses the same stops as the image. */
export const IndexLegend: React.FC<{ config: VisConfig }> = ({ config }) => {
  if (config.stops.length === 0) return null;
  const min = config.stops[0].pos;
  const max = config.stops[config.stops.length - 1].pos;
  const zeroPct = ((0 - min) / (max - min)) * 100;

  return (
    <div className="w-full bg-white dark:bg-slate-800 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-baseline text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
        <span>{config.label}</span>
        <span className="font-mono font-normal text-slate-500 dark:text-slate-400">{config.formula}</span>
      </div>
      <div className="relative">
        <div className="h-3 w-full rounded-full" style={{ background: stopsToCssGradient(config.stops) }} />
        {zeroPct > 0 && zeroPct < 100 && (
          <div className="absolute top-0 h-3 w-px bg-slate-900/50 dark:bg-white/60" style={{ left: `${zeroPct}%` }} />
        )}
      </div>
      <div className="relative h-4 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
        <span className="absolute left-0">≤{formatValue(min)}</span>
        {zeroPct > 15 && zeroPct < 85 && (
          <span className="absolute -translate-x-1/2" style={{ left: `${zeroPct}%` }}>0</span>
        )}
        <span className="absolute right-0">≥{formatValue(max)}</span>
      </div>
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
        <span>{config.legendLabels[0]}</span>
        <span>{config.legendLabels[1]}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400">
        <Swatch color={CLOUD_MASK_COLOR} label="Cloud / shadow" />
        {config.maskWater && <Swatch color={WATER_MASK_COLOR} label="Water" />}
        <Swatch color="#000000" label="No data" />
      </div>
    </div>
  );
};
