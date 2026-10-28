
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || "admin@bookleaf.com"
).toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in server/.env");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, "users.json");
const TICKETS_FILE = path.join(__dirname, "tickets.json");
const DATA_FILE = path.join(__dirname, "bookleaf_sample_data.json");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    booksLoaded: books.length
  });
});
// --------------------------------------------------
// JSON FILE HELPERS
// --------------------------------------------------

async function readJson(file, fallback = []) {
  try {
    const content = await fs.readFile(file, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeJson(file, fallback);
      return fallback;
    }

    throw error;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

const getUsers = () => readJson(USERS_FILE, []);
const saveUsers = (users) => writeJson(USERS_FILE, users);
const getTickets = () => readJson(TICKETS_FILE, []);
const saveTickets = (tickets) => writeJson(TICKETS_FILE, tickets);

function publicUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

function makeToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// --------------------------------------------------
// BOOK DATA
// --------------------------------------------------

let books = [];

function mapDatasetBook(book, authorId, authorName) {
  return {
    id: String(book.book_id),
    title: book.title,
    isbn: book.isbn || "",
    genre: book.genre || "General",
    publicationDate: book.publication_date || "",
    status: book.status || "In Production",
    mrp: Number(book.mrp) || 0,
    soldCopies: Number(book.total_copies_sold) || 0,
    royaltiesEarned: Number(book.total_royalty_earned) || 0,
    royaltiesPaid: Number(book.royalty_paid) || 0,
    royaltiesPending: Number(book.royalty_pending) || 0,
    authorId,
    authorName,
    authorRoyaltyPerCopy: Number(book.author_royalty_per_copy) || 0,
    lastRoyaltyPayoutDate: book.last_royalty_payout_date || null,
    printPartner: book.print_partner || "",
    availableOn: book.available_on || []
  };
}

// --------------------------------------------------
// INITIALIZE APPLICATION DATA
// --------------------------------------------------

async function initializeData() {
  const users = await getUsers();

  // Provision admin account from .env.
  if (ADMIN_PASSWORD) {
    const existingAdmin = users.find(
      (user) => user.email?.toLowerCase() === ADMIN_EMAIL
    );

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    if (existingAdmin) {
      existingAdmin.role = "admin";
      existingAdmin.password = passwordHash;
    } else {
      users.push({
        id: "ADMIN-001",
        name: "BookLeaf Admin",
        email: ADMIN_EMAIL,
        password: passwordHash,
        role: "admin",
        createdAt: new Date().toISOString()
      });
    }

    console.log("Admin account provisioned from environment.");
  } else {
    console.warn(
      "ADMIN_PASSWORD is not set. Configure it in server/.env."
    );
  }

  // Load dataset.
  const dataset = await readJson(DATA_FILE, null);

  if (!dataset || !Array.isArray(dataset.authors)) {
    throw new Error(
      "Invalid dataset. Expected bookleaf_sample_data.json with an authors array."
    );
  }

  const authorIdMap = new Map();
  const now = new Date().toISOString();
  const demoPasswordHash = await bcrypt.hash("Author@123", 10);

  // Create demo accounts for dataset authors.
  for (const author of dataset.authors) {
    if (!author.author_id || !author.email || !author.name) {
      console.warn("Skipping author with missing ID, email or name.");
      continue;
    }

    const email = author.email.trim().toLowerCase();

    let user = users.find(
      (item) => item.email?.toLowerCase() === email
    );

    if (!user) {
      user = {
        id: author.author_id,
        name: author.name,
        email,
        password: demoPasswordHash,
        role: "author",
        createdAt: author.joined_date || now
      };

      users.push(user);
    } else if (user.role !== "admin") {
      // Keep existing account ID and password.
      user.name = author.name;
      user.role = "author";
    }

    if (user.role === "author") {
      authorIdMap.set(author.author_id, user.id);
    }
  }

  // Convert dataset books and link them to their correct authors.
  const loadedBooks = [];

  for (const author of dataset.authors) {
    const userId = authorIdMap.get(author.author_id);

    if (!userId || !Array.isArray(author.books)) {
      continue;
    }

    for (const book of author.books) {
      if (!book.book_id || !book.title) {
        console.warn("Skipping book with missing ID or title.");
        continue;
      }

      loadedBooks.push(
        mapDatasetBook(book, userId, author.name)
      );
    }
  }

  books = loadedBooks;

  await saveUsers(users);
  await getTickets();

  console.log(`Dataset authors mapped: ${authorIdMap.size}`);
  console.log(`Dataset books loaded: ${books.length}`);
  console.log("BookLeaf initialization completed.");
}

// --------------------------------------------------
// AUTHENTICATION MIDDLEWARE
// --------------------------------------------------

async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({
        error: "Authentication required. Please log in."
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const users = await getUsers();
    const user = users.find((item) => item.id === decoded.id);

    if (!user) {
      return res.status(401).json({
        error: "Account not found. Please log in again."
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid or expired token. Please log in again."
    });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required."
    });
  }

  next();
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    message: "BookLeaf Author Support API is running.",
    status: "OK"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    booksLoaded: books.length
  });
});

// --------------------------------------------------
// SIGNUP
// --------------------------------------------------

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        error:
          "Name, valid email and password of at least 8 characters are required."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const users = await getUsers();

    if (
      users.some(
        (user) => user.email?.toLowerCase() === normalizedEmail
      )
    ) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    if (normalizedEmail === ADMIN_EMAIL) {
      return res.status(403).json({
        error: "This email is reserved for the administrator."
      });
    }

    const user = {
      id: `AUTHOR-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
      role: "author",
      createdAt: new Date().toISOString()
    };

    users.push(user);
    await saveUsers(users);

    return res.status(201).json({
      message: "Account created successfully.",
      token: makeToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      error: "Unable to create account."
    });
  }
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: "Email and password are required."
      });
    }

    const users = await getUsers();
    const user = users.find(
      (item) =>
        item.email?.toLowerCase() === email.trim().toLowerCase()
    );

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    return res.json({
      message: "Login successful.",
      token: makeToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      error: "Unable to log in."
    });
  }
});

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// --------------------------------------------------
// BOOKS
// --------------------------------------------------

app.get("/api/books", authenticate, (req, res) => {
  const visibleBooks =
    req.user.role === "admin"
      ? books
      : books.filter((book) => book.authorId === req.user.id);

  res.json(visibleBooks);
});

app.get("/api/books/:id", authenticate, (req, res) => {
  const book = books.find((item) => item.id === req.params.id);

  if (!book) {
    return res.status(404).json({
      error: "Book not found."
    });
  }

  if (
    req.user.role !== "admin" &&
    book.authorId !== req.user.id
  ) {
    return res.status(403).json({
      error: "You do not have access to this book."
    });
  }

  res.json(book);
});

// --------------------------------------------------
// TICKETS: LIST
// --------------------------------------------------

app.get("/api/tickets", authenticate, async (req, res) => {
  try {
    let tickets = await getTickets();

    if (req.user.role !== "admin") {
      tickets = tickets.filter(
        (ticket) => ticket.authorId === req.user.id
      );
    }

    const { status, priority, category } = req.query;

    if (status) {
      tickets = tickets.filter(
        (ticket) =>
          ticket.status?.toLowerCase() === status.toLowerCase()
      );
    }

    if (priority) {
      tickets = tickets.filter(
        (ticket) =>
          ticket.priority?.toLowerCase() === priority.toLowerCase()
      );
    }

    if (category) {
      tickets = tickets.filter(
        (ticket) =>
          ticket.category?.toLowerCase() === category.toLowerCase()
      );
    }

    tickets.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json(tickets);
  } catch (error) {
    console.error("List tickets error:", error);
    res.status(500).json({
      error: "Unable to retrieve tickets."
    });
  }
});

// --------------------------------------------------
// TICKET DETAILS
// --------------------------------------------------

app.get("/api/tickets/:id", authenticate, async (req, res) => {
  try {
    const tickets = await getTickets();
    const ticket = tickets.find(
      (item) => item.id === req.params.id
    );

    if (!ticket) {
      return res.status(404).json({
        error: "Ticket not found."
      });
    }

    if (
      req.user.role !== "admin" &&
      ticket.authorId !== req.user.id
    ) {
      return res.status(403).json({
        error: "You do not have access to this ticket."
      });
    }

    const result = { ...ticket };

    if (req.user.role !== "admin") {
      delete result.internalNotes;
      delete result.assignedTo;
    }

    res.json(result);
  } catch (error) {
    console.error("Ticket details error:", error);
    res.status(500).json({
      error: "Unable to retrieve ticket."
    });
  }
});

// --------------------------------------------------
// CREATE TICKET
// --------------------------------------------------

app.post("/api/tickets", authenticate, async (req, res) => {
  try {
    const { subject, message, category, bookId } = req.body;

    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Subject and detailed message are required."
      });
    }

    if (
      subject.trim().length > 200 ||
      message.trim().length > 10000
    ) {
      return res.status(400).json({
        error: "Subject or message exceeds the allowed length."
      });
    }

    let selectedBookId = null;

    if (bookId && bookId !== "GENERAL") {
      const book = books.find((item) => item.id === bookId);

      if (!book) {
        return res.status(400).json({
          error: "Invalid book selected."
        });
      }

      if (
        req.user.role !== "admin" &&
        book.authorId !== req.user.id
      ) {
        return res.status(403).json({
          error: "You cannot create a ticket for this book."
        });
      }

      selectedBookId = book.id;
    }

    const allowedCategories = [
      "GENERAL",
      "ROYALTIES",
      "PRODUCTION",
      "ISBN",
      "DISTRIBUTION",
      "PAYMENT",
      "TECHNICAL",
      "OTHER"
    ];

    const selectedCategory =
      typeof category === "string" &&
      allowedCategories.includes(category.toUpperCase())
        ? category.toUpperCase()
        : "GENERAL";

    const tickets = await getTickets();

    const ticket = {
      id: `TICKET-${Date.now()}`,
      authorId: req.user.id,
      authorName: req.user.name,
      authorEmail: req.user.email,
      bookId: selectedBookId,
      subject: subject.trim(),
      message: message.trim(),
      category: selectedCategory,
      priority: "Medium",
      status: "Open",
      adminResponse: "",
      internalNotes: [],
      assignedTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    tickets.push(ticket);
    await saveTickets(tickets);

    res.status(201).json({
      message: "Support ticket created successfully.",
      ticket
    });
  } catch (error) {
    console.error("Create ticket error:", error);
    res.status(500).json({
      error: "Unable to create support ticket."
    });
  }
});

// --------------------------------------------------
// AI TICKET ANALYSIS — ADMIN ONLY
// --------------------------------------------------

app.post(
  "/api/ai/analyze-ticket",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      if (!GEMINI_API_KEY) {
        return res.status(503).json({
          error:
            "AI is not configured. Add GEMINI_API_KEY to server/.env."
        });
      }

      const { subject, message, category, bookId } = req.body;

      if (
        typeof subject !== "string" ||
        typeof message !== "string" ||
        !subject.trim() ||
        !message.trim()
      ) {
        return res.status(400).json({
          error: "Ticket subject and message are required."
        });
      }

      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-3.5-flash"
      });

      const knowledgeBase = `
BookLeaf support policies:
1. Authors receive 80% of net profit.
2. Royalties are calculated quarterly and paid within 45 days after quarter end.
3. Minimum payout is Rs. 1000. Smaller amounts roll over.
4. ISBNs are issued under the publisher's imprint.
5. ISBN errors are high priority and must be escalated to production.
6. Printing normally takes 5-7 business days.
7. Verified printing defects qualify for a free reprint.
8. Distribution listings normally take 7-10 business days.
9. Stock synchronization normally takes 24-48 hours.
10. Do not promise an unverified production date.
11. Use professional, empathetic language.
12. Do not invent account details, payment dates or policy exceptions.
      `;

      const prompt = `
You are a professional BookLeaf author-support assistant.
Use only the supplied policies for policy claims.

${knowledgeBase}

Ticket subject: ${subject.trim()}
Ticket message: ${message.trim()}
Submitted category: ${category || "GENERAL"}
Book ID: ${bookId || "GENERAL"}

Return ONLY valid JSON:
{
  "category": "ROYALTIES | PRODUCTION | ISBN | DISTRIBUTION | PAYMENT | TECHNICAL | GENERAL",
  "priority": "Critical | High | Medium | Low",
  "reason": "Short explanation",
  "suggestedReply": "Professional draft reply",
  "nextSteps": ["Step 1", "Step 2"]
}

Do not claim an action has already been completed.
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      const cleaned = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      let analysis;

      try {
        analysis = JSON.parse(cleaned);
      } catch {
        return res.status(502).json({
          error: "AI returned an invalid response. Please try again."
        });
      }

      const categories = [
        "ROYALTIES",
        "PRODUCTION",
        "ISBN",
        "DISTRIBUTION",
        "PAYMENT",
        "TECHNICAL",
        "GENERAL"
      ];

      const priorities = ["Critical", "High", "Medium", "Low"];

      if (!categories.includes(analysis.category)) {
        analysis.category = "GENERAL";
      }

      if (!priorities.includes(analysis.priority)) {
        analysis.priority = "Medium";
      }

      if (typeof analysis.suggestedReply !== "string") {
        analysis.suggestedReply = "";
      }

      if (!Array.isArray(analysis.nextSteps)) {
        analysis.nextSteps = [];
      }

      res.json(analysis);
    } catch (error) {
      console.error("AI analysis error:", error.message);
      console.error("HTTP status:", error.status);

      res.status(502).json({
        error:
          "AI analysis failed. Please check the API key and model configuration."
      });
    }
  }
);

// --------------------------------------------------
// UPDATE TICKET — ADMIN ONLY
// --------------------------------------------------

app.patch(
  "/api/tickets/:id",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const tickets = await getTickets();
      const index = tickets.findIndex(
        (ticket) => ticket.id === req.params.id
      );

      if (index === -1) {
        return res.status(404).json({
          error: "Ticket not found."
        });
      }

      const ticket = tickets[index];
      const {
        status,
        priority,
        category,
        adminResponse,
        internalNote,
        assignedTo
      } = req.body;

      const allowedStatuses = [
        "Open",
        "In Progress",
        "Resolved",
        "Closed"
      ];

      const allowedPriorities = [
        "Critical",
        "High",
        "Medium",
        "Low"
      ];

      const allowedCategories = [
        "GENERAL",
        "ROYALTIES",
        "PRODUCTION",
        "ISBN",
        "DISTRIBUTION",
        "PAYMENT",
        "TECHNICAL",
        "OTHER"
      ];

      if (status !== undefined) {
        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({
            error: "Invalid ticket status."
          });
        }

        ticket.status = status;
      }

      if (priority !== undefined) {
        if (!allowedPriorities.includes(priority)) {
          return res.status(400).json({
            error: "Invalid priority."
          });
        }

        ticket.priority = priority;
      }

      if (category !== undefined) {
        if (
          typeof category !== "string" ||
          !allowedCategories.includes(category.toUpperCase())
        ) {
          return res.status(400).json({
            error: "Invalid category."
          });
        }

        ticket.category = category.toUpperCase();
      }

      if (adminResponse !== undefined) {
        if (
          typeof adminResponse !== "string" ||
          adminResponse.length > 10000
        ) {
          return res.status(400).json({
            error: "Invalid admin response."
          });
        }

        ticket.adminResponse = adminResponse.trim();
      }

      if (
        internalNote !== undefined &&
        String(internalNote).trim()
      ) {
        if (String(internalNote).length > 5000) {
          return res.status(400).json({
            error: "Internal note is too long."
          });
        }

        if (!Array.isArray(ticket.internalNotes)) {
          ticket.internalNotes = [];
        }

        ticket.internalNotes.push({
          note: String(internalNote).trim(),
          author: req.user.name,
          createdAt: new Date().toISOString()
        });
      }

      if (assignedTo !== undefined) {
        if (
          assignedTo !== null &&
          typeof assignedTo !== "string"
        ) {
          return res.status(400).json({
            error: "Invalid assignee."
          });
        }

        ticket.assignedTo = assignedTo;
      }

      ticket.updatedAt = new Date().toISOString();
      tickets[index] = ticket;

      await saveTickets(tickets);

      res.json({
        message: "Ticket updated successfully.",
        ticket
      });
    } catch (error) {
      console.error("Update ticket error:", error);
      res.status(500).json({
        error: "Unable to update ticket."
      });
    }
  }
);

// --------------------------------------------------
// ADMIN SUMMARY
// --------------------------------------------------

app.get(
  "/api/admin/summary",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const tickets = await getTickets();

      res.json({
        total: tickets.length,
        open: tickets.filter((t) => t.status === "Open").length,
        inProgress: tickets.filter(
          (t) => t.status === "In Progress"
        ).length,
        resolved: tickets.filter(
          (t) => t.status === "Resolved"
        ).length,
        closed: tickets.filter((t) => t.status === "Closed").length,
        urgent: tickets.filter(
          (t) => t.priority === "Critical" || t.priority === "High"
        ).length
      });
    } catch (error) {
      console.error("Admin summary error:", error);
      res.status(500).json({
        error: "Unable to load admin summary."
      });
    }
  }
);

// --------------------------------------------------
// ERROR HANDLERS
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled API error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: "An unexpected server error occurred."
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

initializeData()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`BookLeaf API running at http://localhost:${PORT}`);
      console.log(`Gemini AI configured: ${Boolean(GEMINI_API_KEY)}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize BookLeaf API:", error);
    process.exit(1);
  });
