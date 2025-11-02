## Setup Instructions

### **Frontend Setup (Required)**

The backend is already deployed on AWS, so you only need to set up the frontend.

#### **1. Clone the Repository**

```bash
git clone https://github.com/snuhcs-course/swpp-2025-project-team-07.git
cd swpp-2025-project-team-07
git checkout iteration-2-demo
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

## How to Run the Demo

### **Start the Frontend Application**

```bash
cd frontend
npm run dev
```

The Electron desktop app will launch automatically and connect to the production API server at `http://43.202.157.112:8000`.

### **Test the Demo**
1. **Download Required Packages**: If not already downloaded, the user is prompted to install required models such as Gemma 3 before continuing
2. **Sign Up**: Create a new account with email, username, and password
3. **Login**: Authenticate with your credentials
4. **Chat Interface**:
   - View the pre-populated sample conversations
   - Create a new chat session using the "+" button
   - Send messages and receive simulated AI responses
5. **Settings**: Click the profile icon to open the settings dialog
6. **Logout**: Sign out to return to the authentication screen
