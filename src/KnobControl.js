import React, { useRef, useState, useEffect } from 'react';

function KnobControl({ label, value = 0, onChange, min = 0, max = 1, color = '#8b5cf6', size = 'normal' }) {
  const knobRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(0);

  // Size configurations
  const sizes = {
    small: { knob: 40, ring: 18, indicator: 3 },
    normal: { knob: 60, ring: 25, indicator: 5 }
  };
  
  const currentSize = sizes[size] || sizes.normal;

  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e) => {
        const deltaY = startY - e.clientY;
        const sensitivity = 0.005;
        const newValue = Math.max(min, Math.min(max, startValue + deltaY * sensitivity));
        onChange(newValue);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, startY, startValue, min, max, onChange]);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(value);
  };

  const normalizedValue = (value - min) / (max - min);
  const rotation = -135 + normalizedValue * 270;

  return (
    <div className="flex flex-col items-center space-y-1">
      {/* Knob */}
      <div className="relative">
        {/* Outer ring (track) */}
        <svg
          width={currentSize.knob}
          height={currentSize.knob}
          viewBox={`0 0 ${currentSize.knob} ${currentSize.knob}`}
          className="transform -rotate-90"
        >
          {/* Background arc */}
          <circle
            cx={currentSize.knob / 2}
            cy={currentSize.knob / 2}
            r={currentSize.ring}
            fill="none"
            stroke="rgba(139, 92, 246, 0.2)"
            strokeWidth="3"
            strokeDasharray={`${(270 / 360) * (2 * Math.PI * currentSize.ring)}, ${2 * Math.PI * currentSize.ring}`}
            strokeLinecap="round"
          />
          
          {/* Value arc */}
          <circle
            cx={currentSize.knob / 2}
            cy={currentSize.knob / 2}
            r={currentSize.ring}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${normalizedValue * (270 / 360) * (2 * Math.PI * currentSize.ring)}, ${2 * Math.PI * currentSize.ring}`}
            strokeLinecap="round"
            style={{
              transition: isDragging ? 'none' : 'stroke-dasharray 0.1s ease'
            }}
          />
        </svg>

        {/* Knob body */}
        <div
          ref={knobRef}
          onMouseDown={handleMouseDown}
          className="absolute inset-0 flex items-center justify-center cursor-pointer select-none"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.1s ease'
          }}
        >
          <div
            className={`rounded-full shadow-lg flex items-center justify-center ${
              size === 'small' ? 'w-8 h-8' : 'w-12 h-12'
            }`}
            style={{
              background: `linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -30)} 100%)`,
              boxShadow: `0 4px 12px ${color}40`
            }}
          >
            {/* Indicator line */}
            <div
              className={`absolute bg-white rounded-full ${
                size === 'small' ? 'w-0.5 h-3 top-2' : 'w-1 h-5 top-2'
              }`}
              style={{
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }}
            />
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="text-center">
        <p className={`font-semibold text-purple-300 ${size === 'small' ? 'text-[10px]' : 'text-xs'}`}>
          {label}
        </p>
        <p className={`text-purple-400 ${size === 'small' ? 'text-[9px]' : 'text-xs'}`}>
          {Math.round(normalizedValue * 100)}%
        </p>
      </div>
    </div>
  );
}

function adjustColor(color, amount) {
  const num = parseInt(color.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default KnobControl;