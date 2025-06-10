import React, { useState, useEffect } from 'react';
import './App.css';
import ProblemsGallery from './ProblemsGallery';
import LoginPage from './LoginPage';
import OfflineIndicator from './components/OfflineIndicator';
import InstallButton from './components/InstallButton';
import { authAPI } from './utils/auth';
import { register as registerSW, setupInstallPrompt } from './serviceWorkerRegistration';
import { useCSRF } from './hooks/useCSRF';
import { useProtectedFetch } from './hooks/useProtectedFetch';

function App() {
  const [currentPage, setCurrentPage] = useState('upload'); // 'upload', 'gallery', or 'login'
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [problemId, setProblemId] = useState(null);
  const [rating, setRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [subject, setSubject] = useState(null);
  const [preloadedProblem, setPreloadedProblem] = useState(null);
  
  // Authentication state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // CSRF protection
  const { csrfToken, isReady: csrfReady } = useCSRF();
  const { protectedFetch } = useProtectedFetch();

  // Check authentication status on app load and register service worker
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await authAPI.getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error('Auth check error:', error);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();

    // Register service worker for PWA functionality
    registerSW({
      onSuccess: (registration) => {
        console.log('PWA: Service worker registered successfully');
      },
      onUpdate: (registration) => {
        console.log('PWA: New content available, please refresh');
        // You could show a notification here to tell users to refresh
      }
    });

    // Setup install prompt handling
    setupInstallPrompt();
  }, []);

  // Handle logout
  const handleLogout = async () => {
    if (!csrfToken) {
      console.error('CSRF token not available for logout');
      return;
    }
    
    try {
      const success = await authAPI.logout(csrfToken);
      if (success) {
        setUser(null);
        setCurrentPage('login');
        // Reset all state
        resetForm();
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
      setAnalysis(''); // Clear previous analysis
      setError('');
      setProblemId(null); // Clear previous problem ID
      setRating(null); // Clear previous rating
      setSubject(null); // Clear previous subject
      setPreloadedProblem(null); // Clear any preloaded problem
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!selectedImage && !preloadedProblem) {
      setError('Please select an image first');
      return;
    }

    if (!csrfReady) {
      setError('Please wait for security setup to complete');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    
    if (preloadedProblem) {
      // Convert base64 back to blob for preloaded images
      const byteCharacters = atob(preloadedProblem.imageData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: preloadedProblem.mimeType });
      const file = new File([blob], preloadedProblem.imageName || 'preloaded-image', { type: preloadedProblem.mimeType });
      formData.append('image', file);
    } else {
      formData.append('image', selectedImage);
    }
    
    formData.append('question', question);
    // Add CSRF token to form data for multipart upload
    formData.append('_csrf', csrfToken);

    try {
      const response = await fetch('http://localhost:3001/api/analyze-problem', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      setProblemId(data.problemId);
      setSubject(data.subject);
      setRating(null); // Reset rating for new problem
    } catch (err) {
      if (err.message.includes('401') || err.message.includes('Authentication required')) {
        setUser(null);
        setCurrentPage('login');
        setError('Please log in to analyze problems');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRating = async (ratingValue) => {
    if (!problemId || !csrfReady) return;
    
    setRatingLoading(true);
    
    try {
      const response = await protectedFetch(`http://localhost:3001/api/problems/${problemId}/rating`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating: ratingValue })
      });

      if (response.ok) {
        setRating(ratingValue);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Rating failed');
      }
    } catch (err) {
      console.error('Error submitting rating:', err);
      if (err.message.includes('401') || err.message.includes('Authentication required')) {
        setUser(null);
        setCurrentPage('login');
      }
    } finally {
      setRatingLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setQuestion('');
    setAnalysis('');
    setError('');
    setProblemId(null);
    setRating(null);
    setSubject(null);
    setPreloadedProblem(null);
  };

  // Navigation functions
  const goToGallery = () => {
    setCurrentPage('gallery');
  };

  const goToUpload = () => {
    setCurrentPage('upload');
  };

  // Handle "Ask AI" from gallery
  const handleAskAI = (problem) => {
    // Reset form state
    resetForm();
    
    // Set preloaded problem data
    setPreloadedProblem(problem);
    setImagePreview(`data:${problem.mimeType};base64,${problem.imageData}`);
    
    // Navigate to upload page
    setCurrentPage('upload');
  };

  // Show loading spinner while checking authentication or CSRF setup
  if (authLoading || !csrfReady) {
    return (
      <div className="app">
        <div className="auth-loading">
          <div className="spinner"></div>
          <p>{authLoading ? 'Loading...' : 'Setting up security...'}</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  // Render gallery page
  if (currentPage === 'gallery') {
    return <ProblemsGallery onBack={goToUpload} onAskAI={handleAskAI} />;
  }

  // Render upload page
  return (
    <div className="app">
      <OfflineIndicator />
      <InstallButton />
      
      <header className="app-header">
        <div className="header-content">
          <div className="header-text">
            <h1>📚 Student Problem Helper</h1>
            <p>Upload a screenshot of your problem and get step-by-step help!</p>
          </div>
          <div className="header-actions">
            <div className="user-info">
              {user.avatar && <img src={user.avatar} alt="Profile" className="user-avatar" />}
              <span className="user-name">{user.name}</span>
            </div>
            <button onClick={goToGallery} className="gallery-btn">
              🖼️ View Gallery
            </button>
            <button onClick={handleLogout} className="logout-btn">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        {!imagePreview ? (
          <div className="upload-section">
            <div className="upload-card">
              <h2>Upload Your Problem</h2>
              <form onSubmit={handleSubmit}>
                <div className="file-input-wrapper">
                  <input
                    type="file"
                    id="image-upload"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="file-input"
                  />
                  <label htmlFor="image-upload" className="file-input-label">
                    📷 Choose Image
                  </label>
                </div>
                
                <div className="question-input">
                  <label htmlFor="question">Specific question (optional):</label>
                  <textarea
                    id="question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What specifically would you like help with? (e.g., 'I don't understand step 3' or 'How do I approach this type of problem?')"
                    rows="3"
                  />
                </div>

                <button type="submit" className="analyze-btn" disabled={!selectedImage || loading || !csrfReady}>
                  {loading ? 'Analyzing...' : !csrfReady ? 'Setting up security...' : 'Get Help'}
                </button>
              </form>

              {error && <div className="error-message">{error}</div>}
            </div>
          </div>
        ) : (
          <div className="analysis-section">
            <div className="content-grid">
              <div className="image-panel">
                <h3>Your Problem</h3>
                <img src={imagePreview} alt="Uploaded problem" className="problem-image" />
                
                {/* Show question input when image is loaded but analysis hasn't started */}
                {!analysis && !loading && (
                  <div className="question-input-panel">
                    <label htmlFor="question-after-upload">Ask a specific question (optional):</label>
                    <textarea
                      id="question-after-upload"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="What specifically would you like help with? (e.g., 'I don't understand step 3' or 'How do I approach this type of problem?')"
                      rows="3"
                    />
                  </div>
                )}
                
                {question && (
                  <div className="student-question">
                    <strong>Your question:</strong> {question}
                  </div>
                )}
                {subject && (
                  <div className="subject-classification">
                    <strong>Subject:</strong> {subject}
                  </div>
                )}
                {problemId && (
                  <div className="problem-saved">
                    <strong>✅ Saved to database!</strong>
                    <br />
                    <small>Problem ID: #{problemId}</small>
                  </div>
                )}
                <button onClick={resetForm} className="reset-btn">
                  📷 Upload New Problem
                </button>
              </div>

              <div className="analysis-panel">
                <h3>AI Tutor Response</h3>
                {loading ? (
                  <div className="loading">
                    <div className="spinner"></div>
                    <p>Analyzing your problem...</p>
                  </div>
                ) : analysis ? (
                  <div className="analysis-content-wrapper">
                    <div className="analysis-content">
                      <pre className="analysis-text">{analysis}</pre>
                    </div>
                    <div className="rating-section">
                      <p className="rating-question">Was this response helpful?</p>
                      <div className="rating-buttons">
                        <button
                          className={`rating-btn thumbs-up ${rating === 'thumbs_up' ? 'selected' : ''}`}
                          onClick={() => handleRating('thumbs_up')}
                          disabled={ratingLoading || rating || !csrfReady}
                        >
                          👍
                        </button>
                        <button
                          className={`rating-btn thumbs-down ${rating === 'thumbs_down' ? 'selected' : ''}`}
                          onClick={() => handleRating('thumbs_down')}
                          disabled={ratingLoading || rating || !csrfReady}
                        >
                          👎
                        </button>
                      </div>
                      {rating && (
                        <p className="rating-thanks">Thank you for your feedback!</p>
                      )}
                    </div>
                  </div>
                ) : !error && (
                  <div className="waiting-message">
                    <button onClick={handleSubmit} className="analyze-btn" disabled={loading || !csrfReady}>
                      {!csrfReady ? 'Setting up security...' : 'Get Help with This Problem'}
                    </button>
                  </div>
                )}
                
                {error && <div className="error-message">{error}</div>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
