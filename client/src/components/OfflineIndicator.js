import React, { useState, useEffect } from 'react';
import './OfflineIndicator.css';

function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineMessage(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineMessage(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Show message if already offline
    if (!navigator.onLine) {
      setShowOfflineMessage(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const dismissMessage = () => {
    setShowOfflineMessage(false);
  };

  if (!showOfflineMessage) {
    return null;
  }

  return (
    <div className={`offline-indicator ${isOnline ? 'online' : 'offline'}`}>
      <div className="offline-content">
        <div className="offline-icon">
          {isOnline ? '🌐' : '📵'}
        </div>
        <div className="offline-text">
          <strong>
            {isOnline ? 'Back Online!' : 'You\'re Offline'}
          </strong>
          <p>
            {isOnline 
              ? 'Your connection has been restored.'
              : 'Some features may be limited. We\'ll automatically reconnect when possible.'
            }
          </p>
        </div>
        <button className="offline-dismiss" onClick={dismissMessage}>
          ×
        </button>
      </div>
    </div>
  );
}

export default OfflineIndicator; 