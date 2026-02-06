import React from "react";
import "./CarAnimation.scss";

const CarAnimation = ({ isActive = true }) => {
  return (
    <div className="car-animation-container">
      <div className="car-animation-wrapper">
        {/* Road */}
        <div className="road">
          <div className="road-line"></div>
          <div className="road-line"></div>
        </div>

        {/* Car */}
        <div className="car">
          <svg viewBox="0 0 200 100" className="car-svg">
            {/* Car body */}
            <rect x="30" y="40" width="140" height="50" rx="8" fill="url(#carGradient)" />
            {/* Car roof */}
            <path d="M 50 40 L 80 20 L 120 20 L 150 40 Z" fill="url(#carGradient)" />
            {/* Car windows */}
            <rect x="55" y="25" width="25" height="15" rx="2" fill="#87ceeb" opacity="0.8" />
            <rect x="120" y="25" width="25" height="15" rx="2" fill="#87ceeb" opacity="0.8" />
            {/* Car wheels */}
            <circle cx="60" cy="90" r="12" fill="#1a1a1a" />
            <circle cx="60" cy="90" r="8" fill="#333" />
            <circle cx="140" cy="90" r="12" fill="#1a1a1a" />
            <circle cx="140" cy="90" r="8" fill="#333" />
            {/* Wheel rotation effect */}
            <circle cx="60" cy="90" r="6" fill="#555" opacity="0.5" className="wheel-spin" />
            <circle cx="140" cy="90" r="6" fill="#555" opacity="0.5" className="wheel-spin" />
            {/* Car headlights */}
            <circle cx="35" cy="55" r="4" fill="#ffff99" />
            <circle cx="35" cy="75" r="4" fill="#ff6b6b" />
            <defs>
              <linearGradient id="carGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#5b9bd5" />
                <stop offset="50%" stopColor="#4472c4" />
                <stop offset="100%" stopColor="#2e5090" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Status text */}
        <div className="status-text">
          <span className="status-label">Updates in progress</span>
        </div>
      </div>
    </div>
  );
};

export default CarAnimation;

