import React, { useState, useEffect } from 'react';
import './CookieBanner.css';

const STORAGE_KEY = 'cookie_banner_dismissed_v1';

function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show banner only if not dismissed before and if in production
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner" role="alert" aria-live="polite">
      <span>This site uses cookies for the best experience.</span>
      <button className="cookie-banner__btn" onClick={handleDismiss} aria-label="Dismiss cookie message">
        Got it!
      </button>
    </div>
  );
}

export default CookieBanner; 