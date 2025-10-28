
import type { SVGProps } from 'react';

export function NabdAlMalaebLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 200 130" 
      {...props}
    >
      <defs>
        <linearGradient id="pulse-gradient" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: 'hsl(var(--accent))', stopOpacity: 1 }} />
        </linearGradient>
      </defs>

      {/* Pitch Outline */}
      <rect 
        x="5" y="5" 
        width="190" height="120" 
        rx="10" 
        fill="transparent" 
        stroke="currentColor" 
        strokeWidth="3"
      />

      {/* Center Line */}
      <line x1="100" y1="5" x2="100" y2="125" stroke="currentColor" strokeWidth="2" />
      
      {/* Center Circle */}
      <circle cx="100" cy="65" r="15" fill="transparent" stroke="currentColor" strokeWidth="2" />

      {/* Left Penalty Area */}
      <rect x="5" y="30" width="30" height="70" fill="transparent" stroke="currentColor" strokeWidth="2" />
      
      {/* Left Goal Area */}
      <rect x="5" y="45" width="15" height="40" fill="transparent" stroke="currentColor" strokeWidth="2" />

      {/* Corrected Left Penalty Arc (facing outwards) */}
      <path d="M 35 48.75 A 11.25 11.25 0 0 1 35 81.25" fill="none" stroke="currentColor" strokeWidth="2" />


      {/* Right Penalty Area */}
      <rect x="165" y="30" width="30" height="70" fill="transparent" stroke="currentColor" strokeWidth="2" />

      {/* Right Goal Area */}
      <rect x="180" y="45" width="15" height="40" fill="transparent" stroke="currentColor" strokeWidth="2" />

      {/* Corrected Right Penalty Arc (facing outwards) */}
      <path d="M 165 48.75 A 11.25 11.25 0 0 0 165 81.25" fill="none" stroke="currentColor" strokeWidth="2" />


      {/* Pulse Line */}
      <path 
        d="M 20 65 L 50 65 L 60 55 L 70 75 L 80 60 L 90 70 L 100 65 L 110 60 L 120 70 L 130 55 L 140 75 L 150 65 L 180 65" 
        fill="none" 
        stroke="url(#pulse-gradient)" 
        strokeWidth="3"
      />
    </svg>
  );
}
