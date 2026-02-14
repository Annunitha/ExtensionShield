import React from "react";

/**
 * StatsIcon Component
 * SVG bar chart icon for stats/benchmarks visualization
 * Three bars: green (short), red (medium), blue (tall)
 */
const StatsIcon = ({ size = 24, className = "" }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      {/* Green bar (shortest) */}
      <rect
        x="4"
        y="14"
        width="4"
        height="6"
        rx="2"
        fill="#22c55e"
      />
      {/* Red bar (medium) */}
      <rect
        x="10"
        y="10"
        width="4"
        height="10"
        rx="2"
        fill="var(--risk-bad)"
      />
      {/* Blue bar (tallest) */}
      <rect
        x="16"
        y="6"
        width="4"
        height="14"
        rx="2"
        className="fill-info"
      />
    </svg>
  );
};

export default StatsIcon;




