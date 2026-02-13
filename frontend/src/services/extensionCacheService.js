/**
 * Extension Cache Service
 *
 * Fast lookup cache for the first 15 scanned extensions.
 * Stores data + extension icon images (as data URLs) in memory and sessionStorage
 * so icons display immediately without placeholder.
 */

import { getExtensionIconUrl, EXTENSION_ICON_PLACEHOLDER } from "../utils/constants";

const CACHE_KEY = "extensionshield_recent_cache";
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHED = 15;

class ExtensionCacheService {
  constructor() {
    this.memoryCache = null;
    this.cacheTimestamp = 0;
    /** @type {Map<string, string>} extensionId -> data URL or placeholder */
    this.iconDataUrls = new Map();
    this._loadFromSession();
  }

  /**
   * Load cache from sessionStorage on init
   */
  _loadFromSession() {
    try {
      const stored = sessionStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_EXPIRY_MS) {
          this.memoryCache = parsed.data;
          this.cacheTimestamp = parsed.timestamp;
          if (parsed.iconDataUrls && typeof parsed.iconDataUrls === "object") {
            Object.entries(parsed.iconDataUrls).forEach(([id, dataUrl]) => {
              if (id && dataUrl) this.iconDataUrls.set(id, dataUrl);
            });
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  /**
   * Save cache to sessionStorage (data + icon data URLs)
   */
  _saveToSession() {
    try {
      const iconDataUrlsObj = {};
      this.iconDataUrls.forEach((dataUrl, id) => {
        if (dataUrl && dataUrl !== EXTENSION_ICON_PLACEHOLDER) {
          iconDataUrlsObj[id] = dataUrl;
        }
      });
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        data: this.memoryCache,
        timestamp: this.cacheTimestamp,
        iconDataUrls: iconDataUrlsObj
      }));
    } catch {
      // Quota exceeded or private browsing
    }
  }

  /**
   * Fetch an icon from URL and store as data URL
   * @param {string} extensionId
   * @returns {Promise<string>} data URL or placeholder
   */
  async   _fetchAndStoreIcon(extensionId) {
    const url = getExtensionIconUrl(extensionId);
    if (!url || url === EXTENSION_ICON_PLACEHOLDER) return EXTENSION_ICON_PLACEHOLDER;

    try {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) return EXTENSION_ICON_PLACEHOLDER;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) return EXTENSION_ICON_PLACEHOLDER;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      this.iconDataUrls.set(extensionId, dataUrl);
      return dataUrl;
    } catch {
      // Do not store placeholder so getIconUrl falls back to API URL on next render
      return EXTENSION_ICON_PLACEHOLDER;
    }
  }

  /**
   * Fetch and store icons for all extensions (in background).
   * @param {Array} extensions
   * @param {() => void} [onIconStored] - Called when any icon is stored (e.g. to re-render UI)
   */
  _storeIconsForExtensions(extensions, onIconStored) {
    if (!extensions || !Array.isArray(extensions)) return;

    extensions.forEach((ext) => {
      const id = ext?.extensionId || ext?.extension_id;
      if (!id) return;

      this._fetchAndStoreIcon(id).then(() => {
        this._saveToSession();
        onIconStored?.();
      });
    });
  }

  /**
   * Check if cache is valid
   */
  isValid() {
    return this.memoryCache &&
           this.memoryCache.length > 0 &&
           Date.now() - this.cacheTimestamp < CACHE_EXPIRY_MS;
  }

  /**
   * Get cached extensions
   * @returns {Array|null} Cached extensions or null if cache is invalid
   */
  get() {
    if (this.isValid()) {
      return this.memoryCache;
    }
    return null;
  }

  /**
   * Set cache with new extensions data and fetch/store icon images
   * @param {Array} extensions - Array of extension scan data
   * @param {() => void} [onIconStored] - Called when any icon is stored (for UI re-render)
   */
  set(extensions, onIconStored) {
    if (!extensions || !Array.isArray(extensions)) return;

    this.memoryCache = extensions.slice(0, MAX_CACHED);
    this.cacheTimestamp = Date.now();
    this._saveToSession();
    this._storeIconsForExtensions(this.memoryCache, onIconStored);
  }

  /**
   * Get icon URL for display: stored data URL if available, else API URL
   * @param {string} extensionId
   * @returns {string} Data URL, API URL, or placeholder
   */
  getIconUrl(extensionId) {
    const stored = this.iconDataUrls.get(extensionId);
    if (stored && stored !== EXTENSION_ICON_PLACEHOLDER) return stored;
    return getExtensionIconUrl(extensionId);
  }

  /**
   * Check if we have a stored icon (data URL) for this extension
   */
  hasStoredIcon(extensionId) {
    return this.iconDataUrls.has(extensionId);
  }

  /**
   * Clear the cache
   */
  clear() {
    this.memoryCache = null;
    this.cacheTimestamp = 0;
    this.iconDataUrls.clear();
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Force refresh - invalidate cache
   */
  invalidate() {
    this.cacheTimestamp = 0;
  }
}

// Singleton instance
const extensionCacheService = new ExtensionCacheService();
export default extensionCacheService;
