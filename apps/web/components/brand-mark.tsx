import * as React from "react";

/**
 * Brand mark — inline SVG that mirrors the XovenMart logo concept:
 * - Green rounded square background
 * - Stylized "X" formed by two crossing arrows (cream)
 * - Yellow chevron tips
 * - Orange center dot with letter "জ"
 *
 * This is the BRAND MARK that fits a 32–64px slot. For larger hero use,
 * prefer `<BrandLockup />` which renders the full PNG if available in /public,
 * otherwise an inline SVG lockup.
 *
 * The colors here mirror the brand brief (Section 5.1):
 *   - Green #16A34A
 *   - Sun Yellow #FACC15
 *   - Action Orange #F97316
 *   - Cream #FAF7F2
 */
export function BrandMark({
  size = 40,
  rounded = true,
  className,
}: {
  size?: number;
  rounded?: boolean;
  className?: string;
}) {
  const r = rounded ? Math.round(size * 0.22) : 0;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="XovenMart"
    >
      {/* Green rounded square background */}
      <rect x="0" y="0" width="100" height="100" rx={r} ry={r} fill="#16A34A" />

      {/* Cream "X" arrows — diagonal from top-left to bottom-right */}
      <path
        d="M 22 22 L 70 70"
        stroke="#FAF7F2"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />
      {/* Yellow chevron tip at SE end of arrow 1 */}
      <path d="M 70 70 L 56 70 L 70 70 L 70 56 Z" fill="#FACC15" opacity="0" />
      <polygon points="70,70 58,68 68,58" fill="#FACC15" />

      {/* Cream "X" arrows — diagonal from top-right to bottom-left */}
      <path
        d="M 78 22 L 30 70"
        stroke="#FAF7F2"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />
      <polygon points="30,70 42,68 32,58" fill="#FACC15" />

      {/* Top-right arrowhead (chevrons) */}
      <polygon points="22,22 34,24 24,34" fill="#FACC15" />
      <polygon points="78,22 66,24 76,34" fill="#FACC15" />

      {/* Orange center dot with "জ" letter */}
      <circle cx="50" cy="46" r="14" fill="#F97316" />
      <text
        x="50"
        y="52"
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill="#FAF7F2"
        fontFamily="system-ui, sans-serif"
      >
        জ
      </text>
    </svg>
  );
}
