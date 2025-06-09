import React, { useState, useEffect } from 'react';
import './App.css';
import ProblemsGallery from './ProblemsGallery';
import LoginPage from './LoginPage';
import { authAPI } from './utils/auth';
import axios from 'axios';

// Configure axios globally for credentials
axios.defaults.withCredentials = true;

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

  // Check authentication status on app load
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
  }, []);

  // Handle logout
  const handleLogout = async () => {
    try {
      await authAPI.logout();
      setUser(null);
      setCurrentPage('login');
      // Reset all state
      resetForm();
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

    try {
      const response = await axios.post('http://localhost:3001/api/analyze-problem', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        withCredentials: true
      });

      const data = response.data;
      setAnalysis(data.analysis);
      setProblemId(data.problemId);
      setSubject(data.subject);
      setRating(null); // Reset rating for new problem
    } catch (err) {
      if (err.response?.status === 401) {
        setUser(null);
        setCurrentPage('login');
        setError('Please log in to analyze problems');
      } else {
        setError(err.response?.data?.error || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRating = async (ratingValue) => {
    if (!problemId) return;
    
    setRatingLoading(true);
    
    try {
      const response = await axios.put(`http://localhost:3001/api/problems/${problemId}/rating`, 
        { rating: ratingValue },
        { withCredentials: true }
      );

      if (response.status === 200) {
        setRating(ratingValue);
      }
    } catch (err) {
      console.error('Error submitting rating:', err);
      if (err.response?.status === 401) {
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

  // Show loading spinner while checking authentication
  if (authLoading) {
    return (
      <div className="app">
        <div className="auth-loading">
          <div className="spinner"></div>
          <p>Loading...</p>
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

                <button type="submit" className="analyze-btn" disabled={!selectedImage || loading}>
                  {loading ? 'Analyzing...' : 'Get Help'}
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
                          disabled={ratingLoading || rating}
                        >
                          👍
                        </button>
                        <button
                          className={`rating-btn thumbs-down ${rating === 'thumbs_down' ? 'selected' : ''}`}
                          onClick={() => handleRating('thumbs_down')}
                          disabled={ratingLoading || rating}
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
                    <button onClick={handleSubmit} className="analyze-btn" disabled={loading}>
                      Get Help with This Problem
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
