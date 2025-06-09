# 📚 Student Problem Helper

A web application that helps students understand practice problems by analyzing uploaded screenshots using Google's Gemini AI.

## Features

- **Image Upload**: Students can upload screenshots of their practice problems
- **AI Analysis**: Uses Google Gemini AI to provide step-by-step explanations
- **Custom Questions**: Students can ask specific questions about the problem
- **Modern UI**: Clean, responsive interface with side-by-side image and analysis display

## Setup Instructions

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the API key for the next step

### 2. Configure the Backend

1. Navigate to the `server` directory
2. Create a `.env` file:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
3. Replace `your_api_key_here` with your actual Gemini API key

### 3. Install Dependencies

From the root directory:
```bash
# Install root dependencies
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 4. Run the Application

From the root directory:
```bash
npm start
```

This will start both the backend server (port 3001) and the React frontend (port 3000).

## Usage

1. Open your browser to `http://localhost:3000`
2. Click "Choose Image" to upload a screenshot of your problem
3. Optionally, add a specific question about the problem
4. Click "Get Help" to analyze the problem
5. View the AI's step-by-step explanation on the right panel

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.js         # Main application component
│   │   ├── App.css        # Styling
│   │   └── setupProxy.js  # Development proxy configuration
│   └── package.json
├── server/                # Express backend
│   ├── index.js          # Main server file
│   ├── uploads/          # Temporary image uploads
│   └── package.json
├── package.json          # Root package.json for concurrent execution
└── README.md
```

## API Endpoints

### POST `/api/analyze-problem`
- **Purpose**: Analyze uploaded problem images
- **Body**: FormData with `image` file and optional `question` text
- **Response**: JSON with `analysis` text and `originalQuestion`

## Technologies Used

- **Frontend**: React, modern CSS with gradients and animations
- **Backend**: Node.js, Express, Multer (file uploads)
- **AI**: Google Gemini AI (gemini-1.5-flash model)
- **Development**: Concurrently for running both servers

## Notes

- Images are temporarily stored and automatically deleted after processing
- Maximum file size: 5MB
- Supported formats: All common image formats (jpg, png, gif, etc.)
- The application is designed for educational purposes to help students learn 