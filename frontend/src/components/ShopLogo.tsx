import React from 'react';

interface ShopLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  lightText?: boolean;
}

export const ShopLogo: React.FC<ShopLogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
  lightText = false,
}) => {
  const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  };

  const iconSize = sizeMap[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Premium Badge Icon */}
      <div
        className={`${iconSize} shrink-0 rounded-2xl bg-gradient-to-tr from-rose-700 via-red-600 to-amber-500 p-0.5 shadow-lg shadow-rose-900/25 flex items-center justify-center`}
      >
        <div className="w-full h-full rounded-[14px] bg-slate-950/20 backdrop-blur-xs flex items-center justify-center p-1.5">
          <svg
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full text-white"
          >
            {/* Background Crest Shield */}
            <path
              d="M24 4L38 9V20C38 30 29.5 39 24 43C18.5 39 10 30 10 20V9L24 4Z"
              fill="url(#logo_grad)"
              stroke="#fbbf24"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Stylized Rooster Comb & Beak (Left) */}
            <path
              d="M17 19C17 16 19 14 21 15C22 13 24 13 25 15C26 13 28 14 28 16C28 18 26 20 24 21C22 21 21 23 20 25L17 21C16.5 20.5 17 19.5 17 19Z"
              fill="#ffffff"
            />
            <path
              d="M18 20L14 21.5L18 23V20Z"
              fill="#fbbf24"
            />
            {/* Stylized Mutton / Ram Horn Spiral (Right) */}
            <path
              d="M27 18C30 17 33 19 33 22C33 25 30 27 27 26C25.5 25.5 24.5 24 25.5 22.5C26.5 21 28 21.5 29 22.5"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Cleaver Accent */}
            <path
              d="M16 34L32 18"
              stroke="#fbbf24"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <rect
              x="25"
              y="15"
              width="6"
              height="4"
              rx="1"
              transform="rotate(-45 25 15)"
              fill="#ffffff"
            />
            {/* Bold Letter 'R' Monogram at base */}
            <circle cx="24" cy="32" r="5.5" fill="#991b1b" stroke="#fbbf24" strokeWidth="1" />
            <text
              x="24"
              y="35.5"
              textAnchor="middle"
              fill="#ffffff"
              fontWeight="900"
              fontSize="7.5"
              fontFamily="system-ui, sans-serif"
            >
              R
            </text>

            <defs>
              <linearGradient id="logo_grad" x1="10" y1="4" x2="38" y2="43" gradientUnits="userSpaceOnUse">
                <stop stopColor="#b91c1c" />
                <stop offset="0.5" stopColor="#e11d48" />
                <stop offset="1" stopColor="#ea580c" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Brand Text */}
      {showText && (
        <div className="leading-tight">
          <h2
            className={`font-black text-sm sm:text-base tracking-tight ${
              lightText ? 'text-white' : 'text-slate-900'
            }`}
          >
            Reddy Chicken & Mutton
          </h2>
          <p className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider">
            Center
          </p>
        </div>
      )}
    </div>
  );
};
