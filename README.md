# Epsilon Enterprise - Client Management System

A complete full-stack web application for managing enterprise clients with comprehensive features.

## ✨ Features

✅ **Client Management**
- Create new clients with auto-generated IDs (100001-999999)
- View all clients in table format
- Edit existing client information
- Delete clients
- Status tracking (Draft, Pending, Approved)

✅ **Company Information**
- Company name, address, city, state, pincode
- GSTIN and GST Type fields
- Indian states dropdown

✅ **Contact Management**
- Add unlimited contact persons
- Name, mobile, email, designation
- Dynamic add/remove with buttons

✅ **Document Management**
- Upload multiple documents (PDF, DOC, DOCX, JPG, PNG)
- Auto-organized in client folders
- Download capability

✅ **Workflow**
- Save as Draft
- Submit for Approval
- Status tracking

## 🚀 Quick Start

### Prerequisites
- Node.js v14+
- npm v6+

### Installation & Setup

```bash
# 1. Install backend dependencies
npm install

# 2. Install frontend dependencies
cd client
npm install
cd ..

# 3. Start backend (Terminal 1)
npm start
# Runs on http://localhost:5000

# 4. Start frontend (Terminal 2)
cd client
npm start
# Runs on http://localhost:3000
```

Then open: **http://localhost:3000**

## 📁 Project Structure

```
epsilon-enterprise/
├── server.js                    # Express backend
├── package.json                 # Backend dependencies
├── .env                         # Configuration
├── Database/                    # Auto-created client data
│   └── Client/
│       ├── 100001/
│       │   ├── 100001-Company.json
│       │   └── docs/
│       └── ...
└── client/                      # React frontend
    ├── package.json
    ├── public/
    │   └── index.html
    └── src/
        ├── App.js
        ├── App.css
        ├── index.js
        ├── components/
        │   ├── Header.js
        │   └── Sidebar.js
        └── pages/
            ├── CreateClient.js
            ├── ViewClients.js
            └── EditClient.js
```

## 🎯 How to Use

### Create a Client
1. Click "📝 Create Client" in sidebar
2. Fill company information (all * fields required)
3. Add contact persons
4. Upload documents
5. Click "Save as Draft" or "Save & Submit for Approval"

### View & Edit Clients
1. Click "👁️ View/Edit Clients"
2. See all clients in table
3. Click "✏️ Edit" to modify
4. Click "🗑️ Delete" to remove

### Workflow Status
- **Draft** (Orange) - Saved but not submitted
- **Pending** (Blue) - Submitted for approval
- **Approved** (Green) - Approved status

## 📡 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/clients | Get all clients |
| GET | /api/clients/:id | Get single client |
| POST | /api/clients | Create client |
| PUT | /api/clients/:id | Update client |
| DELETE | /api/clients/:id | Delete client |
| GET | /api/clients/:id/download/:file | Download file |

## 💾 Database Structure

Each client is stored as:
```
Database/Client/{clientId}/
├── {clientId}-CompanyName.json
└── docs/
    ├── file1.pdf
    └── file2.docx
```

## 🔧 Configuration

### Backend (.env)
```
PORT=5000
NODE_ENV=development
```

### Frontend (client/package.json)
```json
"proxy": "http://localhost:5000"
```

## 🎨 UI Features

- Professional gradient header (purple/blue)
- Responsive sidebar navigation
- Clean form layouts
- Color-coded status badges
- Dynamic add/remove buttons
- Form validation
- Success/error messages
- Mobile responsive design

## 📝 Form Fields

### Company Information *
- Company Name (required)
- Address (required)
- City (required)
- State (required, dropdown)
- Pincode (required, max 6)
- GSTIN (optional, max 15)
- GST Type (Regular/Composition/Unregistered)

### Contact Persons
- Name
- Mobile Number
- Email
- Designation
- (Add unlimited contacts with ➕ button)

### Documents
- Document Name
- File Upload (PDF, DOC, DOCX, JPG, PNG)
- (Add unlimited documents with ➕ button)

## 🐛 Troubleshooting

### Port 5000 already in use
```bash
# Change PORT in .env
PORT=5001
```

### Dependencies not installing
```bash
rm -rf node_modules package-lock.json
npm install
```

### React app won't start
```bash
cd client
rm -rf node_modules package-lock.json
npm install
npm start
```

### CORS errors
- Ensure backend is running on :5000
- Check proxy setting in client/package.json

## 🔐 Security Notes

For production deployment, add:
- User authentication (JWT)
- HTTPS/TLS encryption
- Input validation
- Rate limiting
- File upload scanning

## 📚 Technologies Used

**Backend**
- Node.js
- Express.js
- Multer (file upload)
- CORS

**Frontend**
- React 18
- React Router v6
- Axios
- CSS3

## 🚀 Deployment

### Simple Deployment

1. Build frontend:
```bash
cd client
npm run build
```

2. Deploy `build/` folder to static host

3. Deploy backend to Node.js hosting

4. Update API URL in frontend

## 📞 Support

- Check console (F12) for errors
- Verify both servers running
- Check .env configuration
- Review documentation files

## 📄 License

MIT License

## 🎉 Ready to Use!

Everything is set up and ready. Start with the Quick Start guide above.

Enjoy using Epsilon Enterprise! 🚀
