/**
 * AppBackground - Global page background used by all routes.
 * Renders: deep navy base + subtle purple ambient + grid + star/noise layer.
 * Per-route accents via CSS variables: --accentHue, --overlayOpacity, --starsOpacity
 */
import React from "react";
import "./AppBackground.scss";

const AppBackground = () => (
  <div className="app-background" aria-hidden="true">
    <div className="app-bg-base" />
    <div className="app-bg-gradient" />
    <div className="app-bg-grid" />
    <div className="app-bg-dots" />
    <div className="app-bg-stars" />
  </div>
);

export default AppBackground;
