# Clone - Iteration 3 Demo

## Table of Contents
- [Demo Overview](#demo-overview)
- [Technology Stack](#technology-stack)
- [Environment & Prerequisites](#environment--prerequisites)
- [Setup Instructions](#setup-instructions)
- [How to Run the Demo](#how-to-run-the-demo)
- [Production API Information](#production-api-information)
- [What This Demo Demonstrates](#what-this-demo-demonstrates)
- [Demo Videos](#demo-videos)

---

## Demo Overview

### Features Implemented

#### **User Authentication System**
- **Signup/Login Flow**: Complete user registration and authentication
- **JWT Token Management**: Secure token-based authentication with refresh tokens
- **Password Security**: Django's built-in password hashing and validation
- **Session Persistence**: Local storage of auth tokens for seamless user experience
- **Logout Functionality**: Token blacklisting for secure session termination

#### **Chat Interface with RAG System**
- **Modern Desktop UI**: Native Electron application with polished design
- **On-device LLM**: Uses locally run Gemma 3 (4B parameters) to power the AI chatbot
- **Session Management**: Create and switch between multiple chat sessions with full CRUD operations
- **Chat Sidebar**: View chat history and manage conversations
- **Message Interface**: Send and receive messages with context-aware AI responses
- **RAG Integration**: Retrieval-Augmented Generation with dual memory system:
  - **Text Memory**: Automatic chat message bundling (every 2 messages) with DRAGON embeddings (768-dim)
  - **Video Memory**: Screen recording storage with CLIP embeddings (512-dim) for visual context retrieval
- **Settings Dialog**: User preferences and profile management

#### **Screen Recording & Video Embedding**
- **On-device Video Embedding**: Extract embeddings from screen recordings after video stops
- **CLIP Model Integration**: Uses CLIP ViT-B-32 for video frame embedding
- **Unified Model Download**: Single download dialog for all required models (LLM, text embedders, video embedder)
- **Model Management**: Automatic detection and download of missing models
- **Frame Sampling**: Uniform frame sampling (1 fps) for efficient video processing
- **Video Storage**: Screen recordings linked to embeddings in Vector DB

#### **Vector Database Integration**
- **Dual VectorDB System**: Separate instances for chat (port 8000) and screen (port 8001) embeddings
- **Plaintext VectorDB**: Milvus-based vector database deployed on AWS
- **Collection Management**: Automatic collection creation per user during signup
- **Semantic Search**: Vector similarity search for retrieving relevant context
- **Backend Integration**: RESTful APIs connecting frontend, API server, and VectorDB

#### **Backend API (AWS Deployed)**
- **Production Server**: Deployed on AWS EC2 (ap-northeast-2, Seoul)
- **RESTful API**: Django REST Framework with comprehensive endpoints
- **User Management**: Profile retrieval and management
- **Chat Management**: Session and message CRUD operations
- **Collection APIs**: VectorDB collection creation and management
- **API Documentation**: Auto-generated Swagger/OpenAPI documentation at production URL
- **AWS S3 Storage**: Static and media files hosted on S3
- **CORS Support**: Configured for Electron desktop app communication

#### **Testing Infrastructure**
- **Comprehensive Test Suite**: Unit tests for frontend and backend
- **Testing Framework**: Vitest + React Testing Library for frontend, Django Test for backend
- **E2E Testing**: Playwright for Electron E2E tests
- **CI/CD Pipeline**: Automated testing with GitHub Actions
- **Code Coverage**: >80% coverage threshold enforced in CI
- **API Mocking**: MSW (Mock Service Worker) for testing

---

## Technology Stack

### **Frontend**
- **Runtime**: Electron 38.1.2 (Desktop Application)
- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite 5.4.20
- **Styling**: Tailwind CSS 4.1.13
- **On-Device Models**: 
  - Gemma-3-4B
  - DRAGON Query/Context Encoders
  - CLIP ViT-B-32 Video Embedder
- **Testing**: Vitest 4.x, React Testing Library, Playwright 1.56+, MSW 2.x

### **Backend**
- **Framework**: Django 5.2
- **API**: Django REST Framework 3.16.1
- **Authentication**: JWT (djangorestframework-simplejwt 5.5.1)
- **Database**: MySQL with mysqlclient 2.2.7
- **Vector Database**: Milvus (PyMilvus 2.4.x)
- **Documentation**: drf-yasg 1.21.10 (Swagger/OpenAPI)
- **CORS**: django-cors-headers 4.8.0
- **Cloud Storage**: AWS S3 (django-storages, boto3)
- **Deployment**: AWS EC2, Gunicorn
- **Testing**: Django Test Framework

### **Database**
- **Relational DB**: MySQL (AWS RDS or EC2-hosted)
- **Vector DB**: Milvus with dual instances
  - Chat VectorDB (port 8000): 768-dim embeddings
  - Screen VectorDB (port 8001): 512-dim embeddings
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
- **Internet Connection**: Required for API communication with AWS backend, and for downloading required models (~8.1 GB total)

---

## Setup Instructions

### **Frontend Setup (Required)**

The backend is already deployed on AWS, so you only need to set up the frontend.

#### **1. Clone the Repository**

```bash
git clone https://github.com/snuhcs-course/swpp-2025-project-team-07.git
cd swpp-2025-project-team-07
git checkout iteration-3-demo
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
1. **Download Required Models**: If not already downloaded, you'll be prompted to download all required models:
   - Gemma 3 (4B) LLM
   - DRAGON Query & Context Encoders
   - CLIP Video Embedder
2. **Sign Up**: Create a new account with email, username, and password
   - Collections are automatically created in both VectorDB instances
3. **Login**: Authenticate with your credentials
4. **Chat Interface**:
   - Create a new chat session using the "+" button
   - Send messages and receive context-aware AI responses powered by RAG
   - Messages are automatically embedded and stored in VectorDB
5. **Screen Recording**:
   - Start recording your screen during conversations
   - Video frames are sampled and embedded using CLIP
   - Recordings are stored and linked to embeddings for future retrieval
6. **RAG in Action**:
   - The system automatically retrieves relevant past conversations
   - Screen recording context is integrated into AI responses
7. **Settings**: Click the profile icon to open the settings dialog
8. **Logout**: Sign out to return to the authentication screen

---

## Production API Information

### **Backend Server**
- **API Base URL**: `http://43.202.157.112:8000`
- **API Documentation**: `http://43.202.157.112:8000/swagger/`
- **Region**: AWS ap-northeast-2 (Seoul)
- **Status**: Live and accessible

### **Vector Database**
- **Chat VectorDB**: `http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/swagger`
- **Screen VectorDB**: `http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/swagger/`
- **Collections**: Auto-created per user with proper dimensions and metrics

Visit the [Swagger Documentation](http://43.202.157.112:8000/swagger/) for interactive API testing.

---

## What This Demo Demonstrates

### **Goals Achieved in Iteration 3**
✅ **End-to-End RAG System**: Complete Retrieval-Augmented Generation with dual memory  
✅ **Text Memory**: Auto-bundling of chat messages with DRAGON embeddings into VectorDB  
✅ **Video Memory**: Screen recordings with CLIP embeddings for visual context  
✅ **Chat Session Management**: Full CRUD operations for sessions and messages  
✅ **VectorDB Integration**: Backend integration with dual Milvus instances  
✅ **Unified Model Download**: Single dialog for all model downloads (~8.1 GB)  
✅ **Video Embedding Pipeline**: On-device video frame sampling → CLIP embedding → mean pooling  
✅ **Collection Management**: Automatic per-user collection creation during signup  
✅ **Comprehensive Testing**: Unit tests + E2E tests with CI/CD integration  
✅ **Test Coverage**: >80% coverage for both frontend and backend
✅ **HE VectorDB Development**: Homomorphic Encryption layer implementation in progress (backend architecture & API server integration completed)

### **Goals Achieved in Iteration 2**
✅ **On-device LLM integration**: Chat interface connected to locally run Gemma 3 model  
✅ **Screen Recording**: Support for screen recording with save functionality  
✅ **Markdown Formatting**: Chat responses rendered in formatted markdown  

### **Goals Achieved in Iteration 1**
✅ **Full-Stack Architecture**: Complete separation of frontend and backend  
✅ **User Authentication**: Secure JWT-based auth system  
✅ **Desktop Application**: Native Electron app for privacy and local execution  
✅ **API Documentation**: Auto-generated Swagger docs for all endpoints  
✅ **Database Integration**: MySQL with Django ORM for data persistence  
✅ **Session Management**: Multiple chat sessions with local storage  
✅ **Cloud Deployment**: Production-ready backend on AWS EC2  
✅ **AWS S3 Integration**: Static and media file storage  

## Next Steps (Future Iterations)

🔄 **Homomorphic Encryption (HE) - In Progress**: Frontend HE integration  
🔄 **Improve RAG Performance**: Improve both chat and video RAG performance  
🔄 **UI/UX Improvements**: Polish user interface and add more interactive features  

---

## Demo Videos

### Iteration 3
[Iteration 3 Demo Video](./iteration3_demo.mp4)

The demo video showcases the following features added in Iteration 3:
1. ~

### Iteration 2
[Iteration 2 Demo Video](./iteration2_demo.mp4)

The demo video showcases the following features added in Iteration 2:
1. Download LLM Model
2. Chat with on-device LLM 
3. Chat responses in formatted markdown
4. Start and stop screen recording
5. Save screen recording to specified location

### Iteration 1
[Iteration 1 Demo Video](./iteration1_demo.mp4)

The demo video showcases the following features added in Iteration 1:
1. Application startup
2. User signup and login flow
3. Chat interface navigation
4. Creating and switching chat sessions
5. Settings and user profile
6. Logout functionality

---

## Technical Architecture

### **RAG Pipeline Flow**
1. **User Message** → Text embedding (DRAGON) → VectorDB storage
2. **AI Response** → Auto-bundled with user message → Stored in VectorDB
3. **New Query** → Vector similarity search → Retrieve relevant context
4. **Screen Recording** → Frame sampling → CLIP embedding → VectorDB storage
5. **Context Assembly** → Text + Video memory → Fed to LLM → Context-aware response

### **Model Specifications**
- **Gemma 3 (4B)**: ~2.8GB, Text generation
- **DRAGON Query Encoder**: ~450MB, 768-dim embeddings for queries
- **DRAGON Context Encoder**: ~450MB, 768-dim embeddings for context
- **CLIP ViT-B-32**: ~350MB, 512-dim embeddings for video frames

### **Testing Coverage**
- **Frontend**: Unit tests for main process, preload scripts, renderer (UI, service, business logic)
- **Backend**: Django tests for user management, chat operations, collection management
- **E2E**: Playwright tests for complete user workflows
- **CI/CD**: Automated testing on every PR with coverage enforcement
