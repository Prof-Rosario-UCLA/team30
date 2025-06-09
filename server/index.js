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

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
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
app.use(express.json());

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
};

// Authentication routes
app.get('/auth/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
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

// New endpoint for analyzing problem images - now requires authentication
app.post('/api/analyze-problem', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const { question } = req.body;
    const userId = req.user.id;
    
    // Create the prompt for Gemini
    const basePrompt = `You are a helpful tutor assistant. Analyze this problem image and provide a clear, step-by-step explanation to help the student understand the concept and solution approach. Focus on teaching the underlying principles rather than just giving the answer.`;
    
    const fullPrompt = question 
      ? `${basePrompt}\n\nStudent's specific question: "${question}"`
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
    const subject = await classifyProblemSubject(imageData, req.file.mimetype, question, text);

    // Save to database with user association
    const savedProblem = await prisma.problem.create({
      data: {
        imageData: imageData,
        imageName: req.file.originalname,
        mimeType: req.file.mimetype,
        question: question || null,
        aiResponse: text,
        subject: subject,
        userId: userId
      }
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ 
      analysis: text,
      originalQuestion: question || null,
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

// Updated endpoint to get all problems - now supports filtering by user
app.get('/api/problems', async (req, res) => {
  try {
    const { mine } = req.query; // ?mine=true to get only user's problems
    
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
    res.json(problems);
  } catch (error) {
    console.error('Error fetching problems:', error);
    res.status(500).json({ error: 'Failed to fetch problems' });
  }
});

// New endpoint to get a specific problem by ID
app.get('/api/problems/:id', async (req, res) => {
  try {
    const problemId = parseInt(req.params.id);
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
    
    res.json(problem);
  } catch (error) {
    console.error('Error fetching problem:', error);
    res.status(500).json({ error: 'Failed to fetch problem' });
  }
});

// Updated endpoint to update problem rating - now requires authentication and ownership
app.put('/api/problems/:id/rating', requireAuth, async (req, res) => {
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

        processed++;
        console.log(`Classified problem ${problem.id} as: ${subject}`);
      } catch (error) {
        console.error(`Error classifying problem ${problem.id}:`, error);
        errors++;
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

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

app.listen(port, () => console.log(`Server listening on port ${port}`)); 