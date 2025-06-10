# Security Implementation Guide

## 🔒 Comprehensive Security Measures

This application now implements multiple layers of security protection against common web vulnerabilities including XSS, CSRF, SQL Injection, and other penetration techniques.

## 🛡️ Security Features Implemented

### 1. **Helmet.js - Security Headers**
```javascript
// Provides 15+ security middleware functions
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
  }
}));
```

**Protection Against:**
- **XSS (Cross-Site Scripting)**: CSP headers prevent execution of malicious scripts
- **Clickjacking**: X-Frame-Options header
- **MIME sniffing**: X-Content-Type-Options header
- **Protocol downgrade**: HSTS header

### 2. **CSRF (Cross-Site Request Forgery) Protection**
```javascript
// Modern CSRF token implementation
const csrfTokens = new csrf();

// Middleware validates CSRF tokens on all non-GET requests
const csrfProtection = (req, res, next) => {
  const token = req.headers['x-csrf-token'];
  const secret = req.session.csrfSecret;
  
  if (!token || !secret || !csrfTokens.verify(secret, token)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
};
```

**How to Use:**
1. GET `/api/csrf-token` to obtain a token
2. Include token in `X-CSRF-Token` header for all POST/PUT/DELETE requests

**Protection Against:**
- **CSRF attacks**: Prevents unauthorized actions from malicious websites

### 3. **Rate Limiting**
```javascript
// Multiple rate limiters for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 auth attempts per IP
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per IP
});
```

**Protection Against:**
- **Brute force attacks**: Limits login attempts
- **DDoS attacks**: General request limiting
- **Resource exhaustion**: Upload limits prevent abuse

### 4. **Input Validation & Sanitization**
```javascript
// Express-validator for input validation
[
  body('question')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Question must be less than 1000 characters')
    .trim()
    .escape()
]

// DOMPurify for XSS prevention
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return purify.sanitize(input, { 
    ALLOWED_TAGS: [], 
    ALLOWED_ATTR: [] 
  });
};
```

**Protection Against:**
- **XSS attacks**: All user inputs are sanitized
- **SQL Injection**: Prisma ORM + input validation
- **NoSQL Injection**: Express-mongo-sanitize middleware
- **Parameter pollution**: HPP middleware

### 5. **Secure Session Configuration**
```javascript
app.use(session({
  secret: process.env.SESSION_SECRET,
  name: 'sessionId', // Don't use default name
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only
    httpOnly: true, // Prevent XSS access to cookies
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict' // CSRF protection
  }
}));
```

**Protection Against:**
- **Session hijacking**: Secure cookie configuration
- **XSS cookie theft**: httpOnly flag
- **CSRF**: sameSite strict policy

### 6. **File Upload Security**
```javascript
// File validation
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
if (!allowedMimeTypes.includes(req.file.mimetype)) {
  return res.status(400).json({ error: 'Invalid file type' });
}

// Size validation (5MB limit)
if (req.file.size > 5 * 1024 * 1024) {
  return res.status(400).json({ error: 'File too large' });
}
```

**Protection Against:**
- **Malicious file uploads**: MIME type validation
- **Resource exhaustion**: File size limits
- **Path traversal**: Multer secure file handling

### 7. **Database Security (Prisma ORM)**
```javascript
// Parameterized queries prevent SQL injection
const problem = await prisma.problem.findUnique({
  where: { id: problemId }, // Automatically parameterized
});
```

**Protection Against:**
- **SQL Injection**: Prisma uses parameterized queries
- **Database exposure**: Connection pooling and error handling

### 8. **Error Handling & Information Disclosure**
```javascript
// Global error handler prevents stack trace leakage
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ 
      error: 'Internal server error',
      details: err.message 
    });
  }
});
```

**Protection Against:**
- **Information disclosure**: No stack traces in production
- **Debug information leakage**: Sanitized error responses

## 🔍 API Security Endpoints

### CSRF Token
```
GET /api/csrf-token
Response: { "csrfToken": "..." }
```

### Security Information
```
GET /api/security-info
Response: {
  "security": {
    "https": true,
    "headers": { ... },
    "rateLimit": { ... },
    "inputValidation": "All inputs are validated and sanitized",
    "session": "Secure session configuration"
  }
}
```

## 🚨 Security Headers Added

| Header | Purpose |
|--------|---------|
| `Content-Security-Policy` | Prevents XSS attacks |
| `X-Frame-Options` | Prevents clickjacking |
| `X-Content-Type-Options` | Prevents MIME sniffing |
| `Strict-Transport-Security` | Enforces HTTPS |
| `X-Download-Options` | IE download security |
| `X-DNS-Prefetch-Control` | DNS prefetch control |

## ⚡ Performance Impact

- **Minimal overhead**: All security middleware is highly optimized
- **Caching preserved**: Security doesn't interfere with existing cache layer
- **Rate limiting**: Protects server resources from abuse

## 🔧 Frontend Integration Required

To use CSRF protection, your frontend needs to:

1. **Fetch CSRF token before making requests:**
```javascript
const response = await fetch('/api/csrf-token');
const { csrfToken } = await response.json();
```

2. **Include token in request headers:**
```javascript
fetch('/api/analyze-problem', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data)
});
```

## 🛠️ Environment Variables

Ensure these environment variables are set:

```bash
SESSION_SECRET=your-strong-random-secret-key
NODE_ENV=production  # For production deployment
GEMINI_API_KEY=your-api-key
```

## ✅ Security Checklist

- [x] **XSS Protection**: Input sanitization + CSP headers
- [x] **CSRF Protection**: Token-based validation
- [x] **SQL Injection**: Prisma ORM parameterized queries
- [x] **Rate Limiting**: Multiple tiers (general, auth, upload)
- [x] **Secure Headers**: Helmet.js implementation
- [x] **Input Validation**: Express-validator on all endpoints
- [x] **File Upload Security**: MIME type + size validation
- [x] **Session Security**: httpOnly, secure, sameSite cookies
- [x] **Error Handling**: No information disclosure
- [x] **Parameter Pollution**: HPP middleware
- [x] **NoSQL Injection**: Express-mongo-sanitize

## 🔒 Additional Security Recommendations

1. **Use HTTPS in production** (required for secure cookies)
2. **Regularly update dependencies** (`npm audit fix`)
3. **Use strong SESSION_SECRET** (32+ random characters)
4. **Monitor logs** for suspicious activity
5. **Consider adding API authentication** for public endpoints
6. **Implement content validation** for AI-generated responses
7. **Add request logging** for audit trails

## 🚀 Testing Security

Test the security implementation:

```bash
# Test rate limiting
curl -X POST http://localhost:3001/api/analyze-problem

# Test CSRF protection
curl -X POST http://localhost:3001/api/problems/1/rating \
  -H "Content-Type: application/json" \
  -d '{"rating":"thumbs_up"}'

# Check security headers
curl -I http://localhost:3001/api/security-info
```

Your application is now secured against the most common web vulnerabilities! 🛡️ 