# Clone - Iteration 1 Demo

## Table of Contents
- [Demo Overview](#demo-overview)
- [Technology Stack](#technology-stack)
- [Environment & Prerequisites](#environment--prerequisites)
- [Setup Instructions](#setup-instructions)
- [How to Run the Demo](#how-to-run-the-demo)
- [Production API Information](#production-api-information)
- [What This Demo Demonstrates](#what-this-demo-demonstrates)
- [Demo Video](#demo-video)

---

## Demo Overview

### Features Implemented

#### **User Authentication System**
- **Signup/Login Flow**: Complete user registration and authentication
- **JWT Token Management**: Secure token-based authentication with refresh tokens
- **Password Security**: Django's built-in password hashing and validation
- **Session Persistence**: Local storage of auth tokens for seamless user experience
- **Logout Functionality**: Token blacklisting for secure session termination

#### **Chat Interface**
- **Modern Desktop UI**: Native Electron application with polished design
- **Session Management**: Create and switch between multiple chat sessions
- **Chat Sidebar**: View chat history and manage conversations
- **Message Interface**: Send and receive messages with simulated AI responses
- **Settings Dialog**: User preferences and profile management

#### **Backend API (AWS Deployed)**
- **Production Server**: Deployed on AWS EC2 (ap-northeast-2, Seoul)
- **RESTful API**: Django REST Framework with comprehensive endpoints
- **User Management**: Profile retrieval and management
- **API Documentation**: Auto-generated Swagger/OpenAPI documentation at production URL
- **AWS S3 Storage**: Static and media files hosted on S3
- **CORS Support**: Configured for Electron desktop app communication

---

## Technology Stack

### **Frontend**
- **Runtime**: Electron 38.1.2 (Desktop Application)
- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite 5.4.20
- **Styling**: Tailwind CSS 4.1.13

### **Backend**
- **Framework**: Django 5.2
- **API**: Django REST Framework 3.16.1
- **Authentication**: JWT (djangorestframework-simplejwt 5.5.1)
- **Database**: MySQL with mysqlclient 2.2.7
- **Documentation**: drf-yasg 1.21.10 (Swagger/OpenAPI)
- **CORS**: django-cors-headers 4.8.0
- **Cloud Storage**: AWS S3 (django-storages, boto3)
- **Deployment**: AWS EC2, Gunicorn

### **Database**
- **System**: MySQL (AWS RDS or EC2-hosted)
- **ORM**: Django ORM with custom User model

### **Cloud Infrastructure**
- **Hosting**: AWS EC2 (ap-northeast-2, Seoul region)
- **Storage**: AWS S3
- **Production API**: `http://43.202.157.112:8000`

---

## Environment & Prerequisites

This demo was tested on the following environment:

- **Device**: MacBook M4 Pro (24GB RAM, 512GB SSD)
- **Operating System**: macOS (Tahoe 26.0.1) - compatible with Windows
- **Node.js**: v22.18.0 or higher
- **npm**: 10.9.2 or compatible
- **Internet Connection**: Required for API communication with AWS backend

---

## Setup Instructions

### **Frontend Setup (Required)**

The backend is already deployed on AWS, so you only need to set up the frontend.

#### **1. Clone the Repository**

```bash
git clone https://github.com/snuhcs-course/swpp-2025-project-team-07.git
cd swpp-2025-project-team-07
git checkout iteration-1-demo
```

#### **2. Install Node.js Dependencies**

```bash
cd frontend
npm install
```

#### **3. Verify Environment Configuration**

The `.env` file is already configured to use the production API:

```env
VITE_API_BASE_URL=http://43.202.157.112:8000
```

No changes needed unless you want to point to a different backend server.

---

## How to Run the Demo

### **Start the Frontend Application**

```bash
cd frontend
npm run dev
```

The Electron desktop app will launch automatically and connect to the production API server at `http://43.202.157.112:8000`.

### **Test the Demo**

1. **Sign Up**: Create a new account with email, username, and password
2. **Login**: Authenticate with your credentials
3. **Chat Interface**:
   - View the pre-populated sample conversations
   - Create a new chat session using the "+" button
   - Send messages and receive simulated AI responses
4. **Settings**: Click the profile icon to open the settings dialog
5. **Logout**: Sign out to return to the authentication screen

---

## Production API Information

### **Backend Server**
- **API Base URL**: `http://43.202.157.112:8000`
- **API Documentation**: `http://43.202.157.112:8000/swagger/`
- **Region**: AWS ap-northeast-2 (Seoul)
- **Status**: Live and accessible

Visit the [Swagger Documentation](http://43.202.157.112:8000/swagger/) for interactive API testing.

---

## What This Demo Demonstrates

### **Goals Achieved in Iteration 1**

✅ **Full-Stack Architecture**: Complete separation of frontend and backend  
✅ **User Authentication**: Secure JWT-based auth system  
✅ **Desktop Application**: Native Electron app for privacy and local 
execution  
✅ **Modern UI/UX**: Polished interface with animations and responsive design  
✅ **API Documentation**: Auto-generated Swagger docs for all endpoints  
✅ **Database Integration**: MySQL with Django ORM for data persistence  
✅ **Session Management**: Multiple chat sessions with local storage  
✅ **Cloud Deployment**: Production-ready backend on AWS EC2  
✅ **AWS S3 Integration**: Static and media file storage  

### **Next Steps (Future Iterations)**

🔄 **LLM Integration**: Connect Gemma 3 model to chat interface  
🔄 **Real AI Responses**: Replace simulated responses with actual model inference  
🔄 **Context Management**: Implement conversation history for the LLM  
🔄 **Screen Recording**: Support screen recording for RAG (Retrieval-Augmented Generation)  
🔄 **Vector Database**: Integrate for semantic search and screen recording retrieval  

---

## Demo Video

[iteration 1 demo video](./iteration1_demo.mov)

The demo video showcases:
1. Application startup
2. User signup and login flow
3. Chat interface navigation
4. Creating and switching chat sessions
5. Settings and user profile
6. Logout functionality
