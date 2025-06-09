import React, { useState, useEffect } from 'react';
import './ProblemsGallery.css';
import OfflineIndicator from './components/OfflineIndicator';
import InstallButton from './components/InstallButton';

function ProblemsGallery({ onBack, onAskAI }) {
  const [problems, setProblems] = useState([]);
  const [filteredProblems, setFilteredProblems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProblems();
    fetchSubjects();
  }, []);

  useEffect(() => {
    // Filter problems when selected subject changes
    if (selectedSubject === 'All') {
      setFilteredProblems(problems);
    } else {
      setFilteredProblems(problems.filter(problem => problem.subject === selectedSubject));
    }
  }, [problems, selectedSubject]);

  const fetchProblems = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/problems');
      if (!response.ok) {
        throw new Error('Failed to fetch problems');
      }
      const data = await response.json();
      setProblems(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/subjects');
      if (response.ok) {
        const data = await response.json();
        setSubjects(['All', ...data.subjects]);
      }
    } catch (err) {
      console.error('Failed to fetch subjects:', err);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleAskAI = (problem) => {
    // Pass the problem data back to the parent
    onAskAI(problem);
  };

  if (loading) {
    return (
      <div className="problems-gallery">
        <div className="gallery-header">
          <button onClick={onBack} className="back-btn">← Back to Upload</button>
          <h1>Problem Gallery</h1>
        </div>
        <div className="loading-gallery">
          <div className="spinner"></div>
          <p>Loading problems...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="problems-gallery">
        <div className="gallery-header">
          <button onClick={onBack} className="back-btn">← Back to Upload</button>
          <h1>Problem Gallery</h1>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="problems-gallery">
      <OfflineIndicator />
      <InstallButton />
      
      <div className="gallery-header">
        <button onClick={onBack} className="back-btn">← Back to Upload</button>
        <h1>Problem Gallery</h1>
        <p>Browse through problems submitted by students</p>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="subject-filter">Filter by Subject:</label>
          <select
            id="subject-filter"
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="subject-filter"
          >
            {subjects.map(subject => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
        </div>
        <div className="results-count">
          Showing {filteredProblems.length} of {problems.length} problems
        </div>
      </div>

      {filteredProblems.length === 0 ? (
        <div className="no-problems">
          <p>No problems found for the selected filter.</p>
        </div>
      ) : (
        <div className="problems-grid">
          {filteredProblems.map(problem => (
            <div key={problem.id} className="problem-card">
              <div className="problem-image-container">
                <img
                  src={`data:${problem.mimeType};base64,${problem.imageData}`}
                  alt={`Problem ${problem.id}`}
                  className="problem-thumbnail"
                  loading="lazy"
                />
              </div>
              <div className="problem-info">
                <div className="problem-meta">
                  <span className="problem-id">#{problem.id}</span>
                  <span className="problem-date">{formatDate(problem.createdAt)}</span>
                </div>
                {problem.subject && (
                  <div className="problem-subject">{problem.subject}</div>
                )}
                <div className="problem-actions">
                  <button 
                    className="ask-ai-btn"
                    onClick={() => handleAskAI(problem)}
                  >
                    Ask AI →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProblemsGallery; 