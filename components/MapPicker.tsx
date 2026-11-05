import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Fix for Leaflet default icon issues in React
const iconRetinaUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png';
const iconUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png';
const shadowUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png';

L.Marker.prototype.options.icon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

interface MapPickerProps {
  onLocationSelect: (lat: number, lng: number) => void;
  initialLat?: number;
  initialLng?: number;
}

export const MapPicker: React.FC<MapPickerProps> = ({ onLocationSelect, initialLat = 15, initialLng = 0 }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Initialize map with a better global view
      const map = L.map(mapContainerRef.current).setView([initialLat, initialLng], 1.5);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        noWrap: true,
        bounds: [[-90, -180], [90, 180]]
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add click handler
      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        // Wrap longitude to -180 to 180
        const wrappedLng = (lng + 180) % 360 - 180;
        
        // Update marker logic
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, wrappedLng]);
        } else {
          markerRef.current = L.marker([lat, wrappedLng]).addTo(map);
        }

        onLocationSelect(lat, wrappedLng);
      });

      // Handle resize
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }

    return () => {
      // Cleanup happens on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border-2 border-slate-300 dark:border-slate-600 relative z-0 transition-colors">
      <div ref={mapContainerRef} className="h-full w-full min-h-[300px] dark:brightness-[0.7] dark:grayscale-[0.5] dark:invert-[1] dark:hue-rotate-180 transition-[filter] duration-300" />
    </div>
  );
};