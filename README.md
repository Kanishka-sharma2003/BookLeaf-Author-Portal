
# BookLeaf – Author Portal

A web-based author portal that helps authors view their books, track royalty earnings, and manage support requests through a simple interface.

## Features

- Author registration and login
- Author dashboard
- View published books and book details
- Track total, paid, and pending royalties
- Create and manage support tickets
- Admin summary and management features
- AI-assisted ticket analysis, when configured

## Technology Stack

| Technology | Purpose |
|---|---|
| React | Frontend user interface |
| Vite | Frontend development server and build tool |
| JavaScript, HTML, CSS | Frontend development |
| Node.js | Backend runtime |
| Express.js | Backend API |
| JWT | Authentication |
| bcrypt | Password hashing |
| JSON files | Sample data and local storage |
| Google Gemini API | Optional AI support integration |

## Project Structure

```text
client/
├── public/
├── src/
├── server/
│   ├── server.js
│   ├── bookleaf_sample_data.json
│   ├── users.json
│   └── tickets.json
├── index.html
├── package.json
├── README.md
└── vite.config.js
```

*Note: Some JSON files may be generated when the backend runs.*

## Requirements

- Node.js and npm
- Visual Studio Code
- A modern web browser

## Installation and Setup

### 1. Clone or open the project

Open the project folder in Visual Studio Code.

### 2. Install frontend dependencies

Run this command in the main project folder:

```bash
npm install
```

### 3. Install backend dependencies

Open a terminal and navigate to the server folder:

```powershell
cd server
npm install
```

### 4. Configure environment variables

Create or update `server/.env` with the environment variables required by `server.js`, such as:

```env
PORT=5000
JWT_SECRET=replace_with_a_long_random_secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace_with_a_strong_password
GEMINI_API_KEY=your_gemini_api_key
```

Use the exact variable names expected by your backend. Keep `.env` private and never commit real secrets.

### 5. Start the backend

From the `server` folder, run:

```bash
node server.js
```

Backend URL: http://localhost:5000

Health check: http://localhost:5000/api/health

### 6. Start the frontend

Open a second terminal in the main project folder and run:

```bash
npm run dev
```

Frontend URL: http://localhost:5173

## Testing

- Open the frontend in a browser.
- Test login with valid credentials.
- Verify that books belong to the logged-in author.
- Check royalty amounts.
- Create and review a support ticket.
- Verify access restrictions for protected pages.

## Security

- Never publish `.env`, API keys, JWT secrets, or passwords.
- Use strong passwords for real accounts.
- Do not use demonstration credentials in production.
- Configure production-grade database storage, validation, and deployment security before public release.

## Future Enhancements

- Database integration
- Royalty statement downloads
- Email notifications
- Advanced analytics
- Automated tests and production deployment

## Project Status

The local backend health check has successfully returned a healthy status with 18 books loaded.

---

**BookLeaf – Author Portal**  
A centralized platform for book management, royalty tracking, and author support.
