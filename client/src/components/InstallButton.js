import React, { useState, useEffect } from 'react';
import { showInstallPrompt } from '../serviceWorkerRegistration';
import './InstallButton.css';

function InstallButton() {
  const [showInstall, setShowInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    const checkInstalled = () => {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true);
        return;
      }
      
      if (window.navigator && window.navigator.standalone) {
        setIsInstalled(true);
        return;
      }
    };

    checkInstalled();

    // Listen for install prompt availability
    const handleInstallAvailable = () => {
      if (!isInstalled) {
        setShowInstall(true);
      }
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setShowInstall(false);
    };

    window.addEventListener('pwa-install-available', handleInstallAvailable);
    window.addEventListener('pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-install-available', handleInstallAvailable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, [isInstalled]);

  const handleInstallClick = () => {
    showInstallPrompt();
    setShowInstall(false);
  };

  const handleDismiss = () => {
    setShowInstall(false);
  };

  if (isInstalled || !showInstall) {
    return null;
  }

  return (
    <div className="install-button-container">
      <div className="install-prompt">
        <div className="install-content">
          <div className="install-icon">📱</div>
          <div className="install-text">
            <strong>Install Problem Helper</strong>
            <p>Get quick access with our app!</p>
          </div>
          <div className="install-actions">
            <button className="install-btn" onClick={handleInstallClick}>
              Install
            </button>
            <button className="install-dismiss" onClick={handleDismiss}>
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InstallButton; 