const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PrismaClient } = require('./generated/prisma');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const csrf = require('csrf');

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();

// Simple in-memory cache with TTL
class Cache {
  constructor(defaultTTL = 5 * 60 * 1000) { // Default 5 minutes TTL
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  set(key, value, ttl = this.defaultTTL) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
    
    // Clean up expired entries periodically
    if (this.cache.size % 50 === 0) {
      this.cleanup();
    }
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  // Get cache stats for debugging
  getStats() {
    this.cleanup();
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Initialize cache instance
const problemCache = new Cache();

// ================================
// SECURITY CONFIGURATION
// ================================

// Initialize DOMPurify with JSDOM
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Initialize CSRF protection
const csrfTokens = new csrf();

// 1. Helmet - Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for file uploads
}));

// 2. Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth attempts per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 uploads per minute
  message: {
    error: 'Too many uploads, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// 3. HPP - Prevent HTTP Parameter Pollution
app.use(hpp());

// 4. MongoDB/NoSQL Injection Prevention (also works for general injection)
app.use(mongoSanitize());

// Input validation helper
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// XSS Protection Helper
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return purify.sanitize(input, { 
    ALLOWED_TAGS: [], 
    ALLOWED_ATTR: [] 
  });
};

// CSRF Token generation endpoint
app.get('/api/csrf-token', (req, res) => {
  const secret = csrfTokens.secretSync();
  const token = csrfTokens.create(secret);
  
  // Store secret in session
  req.session.csrfSecret = secret;
  
  res.json({ csrfToken: token });
});

// CSRF Protection Middleware
const csrfProtection = (req, res, next) => {
  // Skip CSRF for GET requests and authentication routes
  if (req.method === 'GET' || req.path.startsWith('/auth/')) {
    return next();
  }
  
  const token = req.headers['x-csrf-token'];
  const secret = req.session.csrfSecret;
  
  if (!token || !secret || !csrfTokens.verify(secret, token)) {
    return res.status(403).json({ 
      error: 'Invalid CSRF token' 
    });
  }
  
  next();
};

// Session configuration with enhanced security
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production',
  name: 'sessionId', // Don't use default session name
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS in production
    httpOnly: true, // Prevent XSS attacks via document.cookie
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict' // CSRF protection
  }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { googleId: profile.id }
    });

    if (user) {
      // Update existing user info
      user = await prisma.user.update({
        where: { googleId: profile.id },
        data: {
          name: profile.displayName,
          email: profile.emails[0].value,
          avatar: profile.photos[0]?.value
        }
      });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          avatar: profile.photos[0]?.value
        }
      });
    }

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: id }
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true // Important for sessions
}));
app.use(express.json({ limit: '10mb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Limit URL-encoded payload

// Apply CSRF protection to all non-GET routes
app.use(csrfProtection);

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
};

// Authentication routes with rate limiting
app.get('/auth/google', 
  authLimiter,
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  authLimiter,
  passport.authenticate('google', { failureRedirect: 'http://localhost:3000/login' }),
  (req, res) => {
    // Successful authentication, redirect to frontend
    res.redirect('http://localhost:3000');
  }
);

app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to destroy session' });
      }
      res.json({ message: 'Logged out successfully' });
    });
  });
});

// Get current user
app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ 
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar
      }
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Define available subjects/topics
const AVAILABLE_SUBJECTS = [
  'Mathematics - Algebra',
  'Mathematics - Geometry', 
  'Mathematics - Calculus',
  'Mathematics - Statistics',
  'Mathematics - Trigonometry',
  'Physics - Mechanics',
  'Physics - Electricity',
  'Physics - Thermodynamics',
  'Physics - Optics',
  'Chemistry - Organic',
  'Chemistry - Inorganic',
  'Chemistry - Physical',
  'Biology - Cell Biology',
  'Biology - Genetics',
  'Biology - Ecology',
  'Computer Science - Programming',
  'Computer Science - Data Structures',
  'Computer Science - Algorithms',
  'Engineering - Mechanical',
  'Engineering - Electrical',
  'Engineering - Civil',
  'Economics',
  'Business',
  'Literature',
  'History',
  'Other'
];

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Initialize Gemini AI (you'll need to set your API key)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyA0VDLecnUzqK_xYQi-Zu94ProrvQEMwAg');

// Helper function to convert file to generative part
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString('base64'),
      mimeType
    },
  };
}

// Helper function to classify problem subject using Gemini
async function classifyProblemSubject(imageData, mimeType, question = null, aiResponse = null) {
  try {
    const subjects = AVAILABLE_SUBJECTS.join(', ');
    
    let classificationPrompt = `Analyze this problem image and classify it into one of these subjects. Only respond with the exact subject name from this list:

${subjects}

Based on the content of the problem image, determine which subject category it belongs to. Consider:
- Mathematical equations, graphs, or formulas
- Physics diagrams, circuits, or mechanics problems  
- Chemistry molecular structures or reactions
- Biology diagrams or processes
- Programming code or computer science concepts
- Engineering drawings or calculations
- Other academic subjects

`;

    if (question) {
      classificationPrompt += `\nStudent's question: "${question}"`;
    }
    
    if (aiResponse) {
      classificationPrompt += `\nAI response context: "${aiResponse.substring(0, 200)}..."`;
    }

    classificationPrompt += `\n\nRespond with only the subject name from the list above, nothing else.`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: mimeType
      },
    };

    const result = await model.generateContent([classificationPrompt, imagePart]);
    const response = await result.response;
    const classifiedSubject = response.text().trim();

    // Validate that the response is in our list
    if (AVAILABLE_SUBJECTS.includes(classifiedSubject)) {
      return classifiedSubject;
    } else {
      console.log(`Classification returned invalid subject: ${classifiedSubject}`);
      return 'Other'; // Default fallback
    }
  } catch (error) {
    console.error('Error classifying subject:', error);
    return 'Other'; // Default fallback
  }
}

// New endpoint for analyzing problem images - now requires authentication with security
app.post('/api/analyze-problem', 
  uploadLimiter,
  requireAuth, 
  upload.single('image'),
  [
    body('question')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Question must be less than 1000 characters')
      .trim()
      .escape()
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' });
    }

    // Validate file size (already handled by multer, but double-check)
    if (req.file.size > 5 * 1024 * 1024) { // 5MB
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }

    const { question } = req.body;
    const userId = req.user.id;
    
    // Sanitize the question input
    const sanitizedQuestion = question ? sanitizeInput(question.trim()) : null;
    
    // Create the prompt for Gemini
    const basePrompt = `You are a helpful tutor assistant. Analyze this problem image and provide a clear, step-by-step explanation to help the student understand the concept and solution approach. Focus on teaching the underlying principles rather than just giving the answer.`;
    
    const fullPrompt = sanitizedQuestion 
      ? `${basePrompt}\n\nStudent's specific question: "${sanitizedQuestion}"`
      : basePrompt;

    // Get the model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Convert the uploaded image to the format Gemini expects
    const imagePart = fileToGenerativePart(req.file.path, req.file.mimetype);
    // Generate content
    const result = await model.generateContent([fullPrompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Get image data for classification
    const imageData = fs.readFileSync(req.file.path).toString('base64');
    
    // Classify the subject
    const subject = await classifyProblemSubject(imageData, req.file.mimetype, sanitizedQuestion, text);

    // Save to database with user association
    const savedProblem = await prisma.problem.create({
      data: {
        imageData: imageData,
        imageName: sanitizeInput(req.file.originalname),
        mimeType: req.file.mimetype,
        question: sanitizedQuestion || null,
        aiResponse: text,
        subject: subject,
        userId: userId
      }
    });

    // Invalidate cache since a new problem was created
    problemCache.delete(`problems:all`);
    problemCache.delete(`problems:user_${userId}`);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ 
      analysis: text,
      originalQuestion: sanitizedQuestion || null,
      problemId: savedProblem.id,
      subject: subject
    });

  } catch (error) {
    console.error('Error analyzing problem:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to analyze the problem. Please try again.' });
  }
});

// Updated endpoint to get all problems - now supports filtering by user with caching and validation
app.get('/api/problems', 
  [
    query('mine')
      .optional()
      .isBoolean()
      .withMessage('mine parameter must be a boolean value')
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { mine } = req.query; // ?mine=true to get only user's problems
    
    // Create cache key based on query parameters and user
    const userId = req.isAuthenticated() ? req.user.id : 'anonymous';
    const cacheKey = `problems:${mine === 'true' ? `user_${userId}` : 'all'}`;
    
    // Try to get from cache first
    const cachedProblems = problemCache.get(cacheKey);
    if (cachedProblems) {
      console.log(`Cache hit for: ${cacheKey}`);
      return res.json(cachedProblems);
    }
    
    console.log(`Cache miss for: ${cacheKey}`);
    
    let whereClause = {};
    if (mine === 'true' && req.isAuthenticated()) {
      whereClause.userId = req.user.id;
    }

    const problems = await prisma.problem.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        imageName: true,
        imageData: true,
        question: true,
        createdAt: true,
        aiResponse: true,
        rating: true,
        subject: true,
        user: {
          select: {
            name: true,
            avatar: true
          }
        }
      }
    });
    
    // Cache the result for 3 minutes
    problemCache.set(cacheKey, problems, 3 * 60 * 1000);
    
    res.json(problems);
  } catch (error) {
    console.error('Error fetching problems:', error);
    res.status(500).json({ error: 'Failed to fetch problems' });
  }
});

// New endpoint to get a specific problem by ID with caching and validation
app.get('/api/problems/:id',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Problem ID must be a positive integer')
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const problemId = parseInt(req.params.id);
    const cacheKey = `problem:${problemId}`;
    
    // Try to get from cache first
    const cachedProblem = problemCache.get(cacheKey);
    if (cachedProblem) {
      console.log(`Cache hit for: ${cacheKey}`);
      return res.json(cachedProblem);
    }
    
    console.log(`Cache miss for: ${cacheKey}`);
    
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      include: {
        user: {
          select: {
            name: true,
            avatar: true
          }
        }
      }
    });
    
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }
    
    // Cache the result for 10 minutes (individual problems change less frequently)
    problemCache.set(cacheKey, problem, 10 * 60 * 1000);
    
    res.json(problem);
  } catch (error) {
    console.error('Error fetching problem:', error);
    res.status(500).json({ error: 'Failed to fetch problem' });
  }
});

// Updated endpoint to update problem rating - now requires authentication and ownership with validation
app.put('/api/problems/:id/rating', 
  requireAuth,
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Problem ID must be a positive integer'),
    body('rating')
      .isIn(['thumbs_up', 'thumbs_down'])
      .withMessage('Rating must be either "thumbs_up" or "thumbs_down"')
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const problemId = parseInt(req.params.id);
    const { rating } = req.body;
    const userId = req.user.id;
    
    // Validate rating value
    if (!['thumbs_up', 'thumbs_down'].includes(rating)) {
      return res.status(400).json({ error: 'Invalid rating. Must be "thumbs_up" or "thumbs_down"' });
    }
    
    // Check if the problem belongs to the authenticated user
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { userId: true }
    });
    
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }
    
    if (problem.userId !== userId) {
      return res.status(403).json({ error: 'You can only rate your own problems' });
    }
    
    const updatedProblem = await prisma.problem.update({
      where: { id: problemId },
      data: { rating: rating },
      select: {
        id: true,
        rating: true,
        updatedAt: true
      }
    });
    
    // Invalidate cache for this problem and related lists
    problemCache.delete(`problem:${problemId}`);
    problemCache.delete(`problems:all`);
    problemCache.delete(`problems:user_${userId}`);
    
    res.json({ 
      message: 'Rating updated successfully',
      problem: updatedProblem
    });
  } catch (error) {
    console.error('Error updating rating:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Problem not found' });
    }
    res.status(500).json({ error: 'Failed to update rating' });
  }
});

// New endpoint to classify unclassified problems
app.post('/api/classify-problems', async (req, res) => {
  try {
    // Find problems without subjects
    const unclassifiedProblems = await prisma.problem.findMany({
      where: {
        subject: null
      },
      select: {
        id: true,
        imageData: true,
        mimeType: true,
        question: true,
        aiResponse: true
      }
    });

    if (unclassifiedProblems.length === 0) {
      return res.json({ 
        message: 'No unclassified problems found',
        processed: 0
      });
    }

    let processed = 0;
    let errors = 0;

    // Process each unclassified problem
    for (const problem of unclassifiedProblems) {
      try {
        const subject = await classifyProblemSubject(
          problem.imageData,
          problem.mimeType,
          problem.question,
          problem.aiResponse
        );

        await prisma.problem.update({
          where: { id: problem.id },
          data: { subject: subject }
        });

        // Invalidate cache for this specific problem
        problemCache.delete(`problem:${problem.id}`);

        processed++;
        console.log(`Classified problem ${problem.id} as: ${subject}`);
      } catch (error) {
        console.error(`Error classifying problem ${problem.id}:`, error);
        errors++;
      }
    }

    // Invalidate all problem lists since subjects were updated
    problemCache.delete(`problems:all`);
    // Clear user-specific caches (we don't know which users were affected)
    for (const key of problemCache.cache.keys()) {
      if (key.startsWith('problems:user_')) {
        problemCache.delete(key);
      }
    }

    res.json({
      message: 'Classification completed',
      totalFound: unclassifiedProblems.length,
      processed: processed,
      errors: errors
    });

  } catch (error) {
    console.error('Error in batch classification:', error);
    res.status(500).json({ error: 'Failed to classify problems' });
  }
});

// New endpoint to get available subjects
app.get('/api/subjects', (req, res) => {
  res.json({ subjects: AVAILABLE_SUBJECTS });
});

// Cache management endpoint for debugging
app.get('/api/cache/stats', (req, res) => {
  const stats = problemCache.getStats();
  res.json({
    cacheStats: stats,
    description: 'Cache statistics and current keys'
  });
});

// Clear cache endpoint for testing
app.post('/api/cache/clear', (req, res) => {
  problemCache.clear();
  res.json({ message: 'Cache cleared successfully' });
});

// Security information endpoint
app.get('/api/security-info', (req, res) => {
  res.json({
    security: {
      https: req.secure,
      headers: {
        csp: 'Content Security Policy enabled',
        hsts: 'HTTP Strict Transport Security enabled',
        xss: 'XSS Protection enabled',
        csrf: 'CSRF Protection enabled'
      },
      rateLimit: {
        general: '100 requests per 15 minutes',
        auth: '5 requests per 15 minutes',
        upload: '10 requests per minute'
      },
      inputValidation: 'All inputs are validated and sanitized',
      session: 'Secure session configuration'
    }
  });
});

// Test endpoint to verify database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const count = await prisma.problem.count();
    res.json({ 
      message: 'Database connection successful!', 
      problemCount: count 
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Global error handler - prevents information leakage
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  } else {
    res.status(500).json({ 
      error: 'Internal server error',
      details: err.message 
    });
  }
});

// Handle 404 errors
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found' 
  });
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Security features enabled: Helmet, CSRF, Rate Limiting, Input Validation`);
}); 