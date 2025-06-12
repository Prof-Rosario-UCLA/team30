# 📚 Student Problem Helper

A web application that helps students understand practice problems by analyzing uploaded screenshots using Google's Gemini AI.

## Features

- **Image Upload**: Students can upload screenshots of their practice problems
- **AI Analysis**: Uses Google Gemini AI to provide step-by-step explanations
- **Custom Questions**: Students can ask specific questions about the problem
- **Modern UI**: Clean, responsive interface with side-by-side image and analysis display

## Setup Instructions

### 1. Setup Keys/Secrets

First, obtain a Gemini API key and create a Google App Engine instance. Be sure to enable CloudSQL Admin and App Engine Admin on whichever user/IAM you use for this.

Once you have these, place them into app.yaml in lieu of the placeholders that are currently there.

### 2. Set up a CloudSQL database

Within Google Cloud, setup a new CloudSQL instance and then a database. Be sure to keep track of the username and password of this instance.

Once you have created this instance, place the username, password, instance ID, and project name in the appropriate places in the DATABASE_URL variable of app.yaml.

### 3. Deploy to Google App Engine

If you have not yet installed the gcloud cli, do that now. Then, authenticate yourself and set the project ID to the project you are working on (You should have had to create this when creating the App Engine or CloudSQL instance). 

Then, run:
```gcloud app deploy app.yaml```
from the main directory of this repo.

Congrats! You should have deployed this web app to your instance.

## Usage

1. Open your browser to the URL it was deployed to.
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

Non-GET requests require a CSRF token (fetch from `/api/csrf-token`).  
Endpoints tagged **(auth)** need a logged-in user. 

### Auth (should not be used by a person)
- `GET /auth/google` start OAuth  
- `GET /auth/google/callback` OAuth return  
- `GET /auth/user` **(auth)** current session  
- `POST /auth/logout` **(auth, CSRF)**

### Core
- `POST /api/analyze-problem` **(auth, CSRF)** – multipart `image` + `question`, uploads the question and calls the Gemini API. Returns the response  
- `GET  /api/problems?mine=true` – Lists all current questions in the database (can optionally set mine=true to only get problems you uploaded)
- `GET  /api/problems/:id` – Load only a single problem (you need to know the ID)  
- `PUT  /api/problems/:id/rating` **(auth, CSRF)** `{ rating: thumbs_up | thumbs_down }`

### Misc
- `GET /api/subjects` – list of subjects 
- `GET /api/csrf-token` – `{ csrfToken }`  
- `GET /api/cache/stats` / `POST /api/cache/clear` **(CSRF)**  
- `GET /api/security-info`, `GET /api/test-db`

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
