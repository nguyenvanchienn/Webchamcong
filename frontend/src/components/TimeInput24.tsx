import React, { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

export const TimeInput24 = ({ value, onChange, className }: { value: string, onChange: (v: string) => void, className?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9:]/g, '');
    if (val.length === 2 && !value.includes(':') && !val.includes(':')) {
      val += ':';
    }
    if (val.length > 5) val = val.slice(0, 5);
    onChange(val);
  };

  const handleBlur = () => {
    if (!value) return;
    const parts = value.split(':');
    let h = parseInt(parts[0] || '0');
    let m = parseInt(parts[1] || '0');
    if (isNaN(h)) h = 0;
    if (isNaN(m)) m = 0;
    if (h > 23) h = 23;
    if (m > 59) m = 59;
    onChange(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  };

  const [hStr, mStr] = (value || '08:00').split(':');

  return (
    <div className={`relative flex items-center ${className}`} ref={wrapperRef}>
      <input 
        type="text" 
        value={value} 
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder="HH:mm"
        className="w-full h-full outline-none bg-transparent pr-8"
      />
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute right-2 text-gray-500 hover:text-blue-600 focus:outline-none"
      >
        <Clock size={16} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[100] p-2 flex gap-2 w-32" onClick={e => e.stopPropagation()}>
          <div className="flex flex-col h-48 overflow-y-auto w-1/2" style={{ scrollbarWidth: 'thin' }}>
            {Array.from({length: 24}).map((_, i) => {
              const val = i.toString().padStart(2, '0');
              return (
                <div 
                  key={val} 
                  onClick={() => onChange(`${val}:${mStr || '00'}`)}
                  className={`px-2 py-1 cursor-pointer text-sm text-center rounded ${hStr === val ? 'bg-blue-500 text-white font-bold' : 'hover:bg-gray-100'}`}
                >
                  {val}
                </div>
              );
            })}
          </div>
          <div className="w-px bg-gray-200"></div>
          <div className="flex flex-col h-48 overflow-y-auto w-1/2" style={{ scrollbarWidth: 'thin' }}>
            {Array.from({length: 60}).map((_, i) => {
              const val = i.toString().padStart(2, '0');
              return (
                <div 
                  key={val} 
                  onClick={() => { onChange(`${hStr || '08'}:${val}`); setIsOpen(false); }}
                  className={`px-2 py-1 cursor-pointer text-sm text-center rounded ${mStr === val ? 'bg-blue-500 text-white font-bold' : 'hover:bg-gray-100'}`}
                >
                  {val}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
