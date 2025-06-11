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
  // Drag & Drop state
  const [isDragOver, setIsDragOver] = useState(false);
  
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
    if (process.env.NODE_ENV === 'production') {
      registerSW({
        onSuccess: () => console.log('PWA: registered'),
        onUpdate: () => console.log('PWA: update available')
      });
    }

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

  // Helper to process a selected or dropped file
  const processFile = (file) => {
    if (!file) return;
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
    setAnalysis(''); // Clear previous analysis
    setError('');
    setProblemId(null); // Clear previous problem ID
    setRating(null); // Clear previous rating
    setSubject(null); // Clear previous subject
    setPreloadedProblem(null); // Clear any preloaded problem
  };

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    processFile(file);
  };

  // Drag & Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    // Validate file type for accessibility
    if (file && !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }
    processFile(file);
  };

  // Keyboard support for drag & drop zone
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.getElementById('image-upload').click();
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
          <nav className="header-actions" aria-label="Main navigation">
            <div className="user-info">
              {user.avatar && <img src={user.avatar} alt={`${user.name}'s profile picture`} className="user-avatar" />}
              <span className="user-name">{user.name}</span>
            </div>
            <button onClick={goToGallery} className="gallery-btn">
              <span aria-hidden="true">🖼️</span>
              <span>View Gallery</span>
            </button>
            <button onClick={handleLogout} className="logout-btn">
              Sign Out
            </button>
          </nav>
        </div>
      </header>

      <main className="main-content">
        {!imagePreview ? (
          <section className="upload-section" aria-labelledby="upload-heading">
            <div className="upload-card">
              <h2 id="upload-heading">Upload Your Problem</h2>
              <form onSubmit={handleSubmit}>
                <div
                  className={`file-input-wrapper ${isDragOver ? 'drag-over' : ''}`}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onKeyDown={handleKeyDown}
                  tabIndex="0"
                  role="button"
                  aria-label="Click to select an image file or drag and drop an image here"
                  aria-describedby="file-upload-instructions"
                >
                  <input
                    type="file"
                    id="image-upload"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="file-input"
                    aria-describedby="file-upload-instructions"
                  />
                  <label htmlFor="image-upload" className="file-input-label">
                    <span aria-hidden="true">📷</span>
                    <span>Choose or Drag & Drop Image</span>
                  </label>
                  <div id="file-upload-instructions" className="sr-only">
                    Accepted file types: JPEG, PNG, GIF, WebP. Maximum file size: 5MB.
                  </div>
                </div>
                
                <div className="question-input">
                  <label htmlFor="question">Specific question (optional):</label>
                  <textarea
                    id="question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What specifically would you like help with? (e.g., 'I don't understand step 3' or 'How do I approach this type of problem?')"
                    rows="3"
                    aria-describedby="question-help"
                  />
                  <div id="question-help" className="sr-only">
                    Optional: Provide specific details about what you need help with
                  </div>
                </div>

                <button type="submit" className="analyze-btn" disabled={!selectedImage || loading || !csrfReady}>
                  {loading ? 'Analyzing...' : !csrfReady ? 'Setting up security...' : 'Get Help'}
                </button>
              </form>

              {error && (
                <div className="error-message" role="alert" aria-live="polite">
                  <span className="sr-only">Error: </span>
                  {error}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="analysis-section" aria-labelledby="analysis-heading">
            <div className="content-grid">
              <article className="image-panel">
                <h3 id="analysis-heading">Your Problem</h3>
                <img src={imagePreview} alt="Student's uploaded problem for analysis" className="problem-image" />
                
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
                      aria-describedby="question-after-help"
                    />
                    <div id="question-after-help" className="sr-only">
                      Optional: Add or modify your question before getting AI help
                    </div>
                  </div>
                )}
                
                {question && (
                  <div className="student-question" role="region" aria-labelledby="student-question-heading">
                    <h4 id="student-question-heading" className="sr-only">Student's Question</h4>
                    <strong>Your question:</strong> {question}
                  </div>
                )}
                {subject && (
                  <div className="subject-classification" role="region" aria-labelledby="subject-heading">
                    <h4 id="subject-heading" className="sr-only">Subject Classification</h4>
                    <strong>Subject:</strong> {subject}
                  </div>
                )}
                {problemId && (
                  <div className="problem-saved" role="status" aria-live="polite">
                    <strong>✅ Saved to database!</strong>
                    <br />
                    <small>Problem ID: #{problemId}</small>
                  </div>
                )}
                <button onClick={resetForm} className="reset-btn">
                  <span aria-hidden="true">📷</span>
                  <span>Upload New Problem</span>
                </button>
              </article>

              <article className="analysis-panel">
                <h3 id="ai-response-heading">AI Tutor Response</h3>
                {loading ? (
                  <div className="loading" role="status" aria-live="polite" aria-label="Analyzing your problem">
                    <div className="spinner"></div>
                    <p>Analyzing your problem...</p>
                  </div>
                ) : analysis ? (
                  <div className="analysis-content-wrapper">
                    <div className="analysis-content" role="region" aria-labelledby="ai-response-heading">
                      <pre className="analysis-text">{analysis}</pre>
                    </div>
                    <div className="rating-section" role="region" aria-labelledby="rating-heading">
                      <h4 id="rating-heading" className="sr-only">Rate this response</h4>
                      <p className="rating-question">Was this response helpful?</p>
                      <div className="rating-buttons">
                        <button
                          className={`rating-btn thumbs-up ${rating === 'thumbs_up' ? 'selected' : ''}`}
                          onClick={() => handleRating('thumbs_up')}
                          disabled={ratingLoading || rating || !csrfReady}
                          aria-label="Rate response as helpful"
                          aria-pressed={rating === 'thumbs_up'}
                        >
                          <span aria-hidden="true">👍</span>
                          <span className="sr-only">Helpful</span>
                        </button>
                        <button
                          className={`rating-btn thumbs-down ${rating === 'thumbs_down' ? 'selected' : ''}`}
                          onClick={() => handleRating('thumbs_down')}
                          disabled={ratingLoading || rating || !csrfReady}
                          aria-label="Rate response as not helpful"
                          aria-pressed={rating === 'thumbs_down'}
                        >
                          <span aria-hidden="true">👎</span>
                          <span className="sr-only">Not helpful</span>
                        </button>
                      </div>
                      {rating && (
                        <p className="rating-thanks" role="status" aria-live="polite">Thank you for your feedback!</p>
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
                
                {error && (
                  <div className="error-message" role="alert" aria-live="assertive">
                    <span className="sr-only">Error: </span>
                    {error}
                  </div>
                )}
              </article>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
