
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000";
const TOKEN_KEY = "bookleaf_token";

const CATEGORIES = [
  "Royalty & Payments",
  "ISBN & Metadata Issues",
  "Printing & Quality",
  "Distribution & Availability",
  "Book Status & Production Updates",
  "General Inquiry",
];

const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

async function apiRequest(path, token, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;

  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;

    response = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)} seconds. Please try again.`
      );
    }

    throw new Error(
      "Backend se connection nahi ho paya. Check whether the server is running."
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "Invalid server response." };
  }

  if (!response.ok) {
    throw new Error(
      data.error || data.message || `Request failed (${response.status})`
    );
  }

  return data;
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem(TOKEN_KEY) || ""
  );
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [page, setPage] = useState("Dashboard");
  const [books, setBooks] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setBooks([]);
    setTickets([]);
    setPage("Dashboard");
    setError("");
  }, []);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      if (!token) {
        setCheckingSession(false);
        return;
      }

      try {
        const data = await apiRequest("/api/auth/me", token);
        if (active) setUser(data.user);
      } catch {
        if (active) {
          localStorage.removeItem(TOKEN_KEY);
          setToken("");
          setUser(null);
        }
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    verifySession();

    return () => {
      active = false;
    };
  }, [token]);

  const loadData = useCallback(
    async (showLoading = true) => {
      if (!token || !user) return;

      try {
        if (showLoading) setLoading(true);
        setError("");

        const [bookData, ticketData] = await Promise.all([
          apiRequest("/api/books", token),
          apiRequest("/api/tickets", token),
        ]);

        if (!Array.isArray(bookData) || !Array.isArray(ticketData)) {
          throw new Error("Unexpected data received from backend.");
        }

        setBooks(bookData);
        setTickets(ticketData);
      } catch (err) {
        if (/expired|invalid login|authentication required/i.test(err.message)) {
          logout();
          return;
        }

        setError(err.message || "Backend se data load nahi hua.");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [token, user, logout]
  );

  useEffect(() => {
    if (user && token) loadData();
  }, [user, token, loadData]);

  if (checkingSession) {
    return (
      <div className="auth-screen">
        <section className="auth-card">Checking your session...</section>
      </div>
    );
  }

  if (!user || !token) {
    return (
      <AuthScreen
        onLogin={(data) => {
          localStorage.setItem(TOKEN_KEY, data.token);
          setToken(data.token);
          setUser(data.user);
          setPage("Dashboard");
        }}
      />
    );
  }

  const isAdmin = user.role === "admin";

  const visiblePages = isAdmin
    ? ["Dashboard", "Support Tickets", "Messages", "Admin Portal"]
    : ["Dashboard", "My Books", "Royalties", "Support Tickets", "Messages"];

  const totalRoyalties = books.reduce(
    (sum, book) => sum + Number(book.royaltiesEarned || 0),
    0
  );

  const openTickets = tickets.filter(
    (ticket) => ticket.status === "Open"
  ).length;

  async function handleTicketCreated() {
    await loadData(false);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>BookLeaf</h2>
        <p className="sidebar-subtitle">Author Support Portal</p>

        <p className="nav-section-title">
          {isAdmin ? "MANAGEMENT" : "AUTHOR"}
        </p>

        {visiblePages.map((item) => (
          <button
            key={item}
            className={`nav-item ${page === item ? "active" : ""}`}
            onClick={() => setPage(item)}
          >
            {item}
          </button>
        ))}

        {isAdmin && (
          <>
            <p className="nav-section-title">AUTHOR TOOLS</p>
            <button
              className={`nav-item ${page === "My Books" ? "active" : ""}`}
              onClick={() => setPage("My Books")}
            >
              My Books
            </button>
          </>
        )}

        <div className="sidebar-footer">
          <strong>BookLeaf</strong>
          <span>Publishing Support</span>
          <button className="secondary-button" onClick={logout}>
            Log Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>{page}</h1>
            <p>
              Welcome, {user.name} · {isAdmin ? "Administrator" : "Author"}
            </p>
          </div>
          <div className="avatar">
            {user.name?.trim()?.charAt(0)?.toUpperCase() || "U"}
          </div>
        </header>

        {error && (
          <div className="error-message" role="alert">
            {error}{" "}
            <button onClick={() => loadData()}>Retry</button>
          </div>
        )}

        {loading ? (
          <section className="panel">Loading information...</section>
        ) : (
          <>
            {page === "Dashboard" && (
              <>
                <section className="welcome-banner">
                  <h2>Your publishing journey, all in one place.</h2>
                  <p>
                    {isAdmin
                      ? "Review support operations and manage incoming requests."
                      : "Manage your books, track royalties and contact our support team."}
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      setPage(isAdmin ? "Admin Portal" : "Support Tickets")
                    }
                  >
                    {isAdmin ? "Manage Tickets" : "Get Support"}
                  </button>
                </section>

                <section className="stats-grid">
                  <StatCard
                    label={isAdmin ? "Visible Books" : "My Books"}
                    value={books.length}
                  />
                  <StatCard label="Support Tickets" value={tickets.length} />
                  <StatCard
                    label="Royalties Earned"
                    value={formatCurrency(totalRoyalties)}
                  />
                  <StatCard label="Open Tickets" value={openTickets} />
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <h3>{isAdmin ? "Sample Books" : "My Books"}</h3>
                    <button
                      className="text-button"
                      onClick={() => setPage("My Books")}
                    >
                      View all
                    </button>
                  </div>
                  <BookList books={books.slice(0, 4)} />
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <h3>Recent Support Tickets</h3>
                    <button
                      className="text-button"
                      onClick={() => setPage("Messages")}
                    >
                      View tickets
                    </button>
                  </div>
                  <TicketList tickets={tickets.slice(0, 4)} />
                </section>
              </>
            )}

            {page === "My Books" && (
              <section className="panel">
                <h3>My Books</h3>
                <p>Books associated with your account.</p>
                <BookList books={books} />
              </section>
            )}

            {page === "Royalties" && (
              <section className="panel">
                <h3>Royalties Overview</h3>
                <section className="stats-grid">
                  <StatCard
                    label="Total Earned"
                    value={formatCurrency(totalRoyalties)}
                  />
                  <StatCard
                    label="Total Paid"
                    value={formatCurrency(
                      books.reduce(
                        (sum, book) =>
                          sum + Number(book.royaltiesPaid || 0),
                        0
                      )
                    )}
                  />
                  <StatCard
                    label="Pending"
                    value={formatCurrency(
                      books.reduce(
                        (sum, book) =>
                          sum + Number(book.royaltiesPending || 0),
                        0
                      )
                    )}
                  />
                </section>
                <BookList books={books} />
                <p className="helper-text">
                  Royalty figures are based on the records currently available
                  to your account.
                </p>
              </section>
            )}

            {page === "Support Tickets" && (
              <TicketForm
                books={books}
                token={token}
                onCreated={handleTicketCreated}
              />
            )}

            {page === "Messages" && (
              <section className="panel">
                <h3>Support Messages</h3>
                <p>
                  Track your requests and responses from BookLeaf support.
                </p>
                <AuthorTicketList tickets={tickets} />
              </section>
            )}

            {page === "Admin Portal" && isAdmin && (
              <AdminDashboard
                token={token}
                user={user}
                onUpdated={() => loadData(false)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const path =
        mode === "login" ? "/api/auth/login" : "/api/auth/signup";

      const body =
        mode === "login"
          ? { email, password }
          : { name, email, password };

      const data = await apiRequest(path, "", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!data.token || !data.user) {
        throw new Error("Login response was incomplete.");
      }

      onLogin(data);
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">BookLeaf</div>
        <p className="sidebar-subtitle">Author Support Portal</p>
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p>
          {mode === "login"
            ? "Sign in to continue to your publishing dashboard."
            : "Register as an author to get started."}
        </p>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <>
              <label htmlFor="auth-name">Full name</label>
              <input
                id="auth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
              />
            </>
          )}

          <label htmlFor="auth-email">Email address</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={8}
            maxLength={128}
            required
          />

          {mode === "signup" && (
            <p className="helper-text">Use at least 8 characters.</p>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          <button
            className="primary auth-submit"
            type="submit"
            disabled={busy}
          >
            {busy
              ? "Please wait..."
              : mode === "login"
                ? "Log In"
                : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "login" ? "New to BookLeaf? " : "Already registered? "}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </section>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <h2>{value}</h2>
    </article>
  );
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function BookList({ books }) {
  if (!books.length) {
    return (
      <p className="empty-state">
        No books are assigned to this account yet.
      </p>
    );
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Book Title</th>
            <th>ISBN</th>
            <th>Genre</th>
            <th>Publication Date</th>
            <th>Status</th>
            <th>MRP</th>
            <th>Copies Sold</th>
            <th>Royalties Earned</th>
            <th>Paid</th>
            <th>Pending</th>
          </tr>
        </thead>
        <tbody>
          {books.map((book, index) => (
            <tr key={book.id || book._id || index}>
              <td>{book.title || "Untitled"}</td>
              <td>{book.isbn || "—"}</td>
              <td>{book.genre || "—"}</td>
              <td>{book.publicationDate || "—"}</td>
              <td>
                <span className="status-badge">
                  {book.status || "Pending"}
                </span>
              </td>
              <td>{formatCurrency(book.mrp)}</td>
              <td>{Number(book.soldCopies || 0)}</td>
              <td>{formatCurrency(book.royaltiesEarned)}</td>
              <td>{formatCurrency(book.royaltiesPaid)}</td>
              <td>{formatCurrency(book.royaltiesPending)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketList({ tickets }) {
  if (!tickets.length) {
    return <p className="empty-state">No support tickets yet.</p>;
  }

  return (
    <div className="ticket-list">
      {tickets.map((ticket, index) => (
        <article className="ticket-item" key={ticket.id || index}>
          <div>
            <h4>{ticket.subject || "Support request"}</h4>
            <p>{ticket.category || "General Inquiry"}</p>
          </div>
          <span className={`status-badge status-${slug(ticket.status)}`}>
            {ticket.status || "Open"}
          </span>
        </article>
      ))}
    </div>
  );
}

function AuthorTicketList({ tickets }) {
  if (!tickets.length) {
    return <p className="empty-state">No support tickets yet.</p>;
  }

  return (
    <div className="ticket-list">
      {tickets.map((ticket, index) => (
        <article className="ticket-item author-ticket" key={ticket.id || index}>
          <div>
            <h4>{ticket.subject || "Support request"}</h4>
            <p>Ticket ID: {ticket.id}</p>
            <p>Category: {ticket.category || "General Inquiry"}</p>
            <p>Message: {ticket.message}</p>
            <p className="helper-text">
              Created:{" "}
              {ticket.createdAt
                ? new Date(ticket.createdAt).toLocaleString("en-IN")
                : "—"}
            </p>
            {ticket.adminResponse && (
              <div className="admin-reply">
                <strong>BookLeaf Support Reply</strong>
                <p>{ticket.adminResponse}</p>
              </div>
            )}
          </div>
          <span className={`status-badge status-${slug(ticket.status)}`}>
            {ticket.status || "Open"}
          </span>
        </article>
      ))}
    </div>
  );
}

function TicketForm({ books, token, onCreated }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("General Inquiry");
  const [message, setMessage] = useState("");
  const [bookId, setBookId] = useState("GENERAL");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback("");
    setIsError(false);

    try {
      const data = await apiRequest("/api/tickets", token, {
        method: "POST",
        body: JSON.stringify({
          subject,
          category,
          message,
          bookId: bookId || "GENERAL",
        }),
      });

      setFeedback(data.message || "Ticket created successfully.");
      setSubject("");
      setMessage("");
      setCategory("General Inquiry");
      setBookId("GENERAL");
      await onCreated();
    } catch (err) {
      setIsError(true);
      setFeedback(err.message || "Ticket could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel ticket-panel">
      <h3>Create a Support Ticket</h3>
      <p>Tell our team how we can help you.</p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="ticket-book">Related Book</label>
        <select
          id="ticket-book"
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
        >
          <option value="GENERAL">General inquiry / account level</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>

        <label htmlFor="ticket-subject">Subject</label>
        <input
          id="ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          minLength={3}
          maxLength={150}
          required
        />

        <label htmlFor="ticket-category">Category</label>
        <select
          id="ticket-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>

        <label htmlFor="ticket-message">Detailed description</label>
        <textarea
          id="ticket-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your issue..."
          rows={5}
          minLength={10}
          maxLength={5000}
          required
        />

        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Ticket"}
        </button>
      </form>

      {feedback && (
        <p className={isError ? "error" : "success"} role="status">
          {feedback}
        </p>
      )}
    </section>
  );
}

function AdminDashboard({ token, user, onUpdated }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tickets, setTickets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");

  const loadAdminData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [ticketData, summaryData] = await Promise.all([
        apiRequest("/api/tickets", token),
        apiRequest("/api/admin/summary", token),
      ]);

      setTickets(ticketData);
      setSummary(summaryData);
    } catch (err) {
      setError(err.message || "Could not load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  async function updateTicket(ticketId, changes) {
    if (!ticketId) {
      setError("Ticket ID missing.");
      return false;
    }

    try {
      await apiRequest(
        `/api/tickets/${encodeURIComponent(ticketId)}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify(changes),
        }
      );

      await loadAdminData();
      await onUpdated();
      return true;
    } catch (err) {
      setError(err.message || "Ticket update failed.");
      return false;
    }
  }

  const visibleTickets = tickets
    .filter((ticket) => filter === "All" || ticket.status === filter)
    .filter(
      (ticket) =>
        priorityFilter === "All" || ticket.priority === priorityFilter
    )
    .filter(
      (ticket) =>
        categoryFilter === "All" || ticket.category === categoryFilter
    )
    .filter((ticket) => {
      const text = [
        ticket.id,
        ticket.authorName,
        ticket.subject,
        ticket.category,
        ticket.message,
        ticket.assignedTo,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(search.toLowerCase().trim());
    })
    .filter((ticket) => {
      if (!dateFrom && !dateTo) return true;

      if (!ticket.createdAt) return false;

      const ticketDate = new Date(ticket.createdAt);

      if (Number.isNaN(ticketDate.getTime())) return false;

      // Compare using local calendar dates.
      const year = ticketDate.getFullYear();
      const month = String(ticketDate.getMonth() + 1).padStart(2, "0");
      const day = String(ticketDate.getDate()).padStart(2, "0");
      const createdDate = `${year}-${month}-${day}`;

      if (dateFrom && createdDate < dateFrom) return false;
      if (dateTo && createdDate > dateTo) return false;

      return true;
    })
    .sort((a, b) => {
      const priorityRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const aUrgency = priorityRank[a.priority] ?? 4;
      const bUrgency = priorityRank[b.priority] ?? 4;

      if (aUrgency !== bUrgency) return aUrgency - bUrgency;

      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  if (loading) {
    return <section className="panel">Loading admin dashboard...</section>;
  }

  return (
    <div className="admin-dashboard">
      <section className="welcome-banner admin-banner">
        <h2>Support Operations</h2>
        <p>Review author requests, set priorities and respond to tickets.</p>
        <button className="primary" onClick={loadAdminData}>
          Refresh Tickets
        </button>
      </section>

      {error && (
        <div className="error-message" role="alert">
          {error} <button onClick={loadAdminData}>Retry</button>
        </div>
      )}

      <section className="stats-grid">
        <StatCard label="Total Tickets" value={summary?.total ?? 0} />
        <StatCard label="Open" value={summary?.open ?? 0} />
        <StatCard label="In Progress" value={summary?.inProgress ?? 0} />
        <StatCard label="Resolved" value={summary?.resolved ?? 0} />
        <StatCard label="Closed" value={summary?.closed ?? 0} />
        <StatCard label="Critical / High" value={summary?.urgent ?? 0} />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>All Support Tickets</h3>
            <p>{visibleTickets.length} ticket(s) found</p>
          </div>
          <button className="text-button" onClick={loadAdminData}>
            Refresh
          </button>
        </div>

        <div className="admin-filters">
          <input
            aria-label="Search tickets"
            placeholder="Search author, subject or ticket ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            aria-label="Status filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="All">All statuses</option>
            {STATUSES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <select
            aria-label="Priority filter"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="All">All priorities</option>
            {PRIORITIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <select
            aria-label="Category filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">All categories</option>
            {CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <div className="date-filter">
            <label htmlFor="date-from">From date</label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="date-filter">
            <label htmlFor="date-to">To date</label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            disabled={!dateFrom && !dateTo}
          >
            Clear Dates
          </button>
        </div>

        {!visibleTickets.length ? (
          <p className="empty-state">
            No tickets match your search or filters.
          </p>
        ) : (
          <div className="admin-ticket-list">
            {visibleTickets.map((ticket) => (
              <AdminTicketCard
                key={ticket.id}
                ticket={ticket}
                token={token}
                user={user}
                onUpdate={updateTicket}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AdminTicketCard({ ticket, token, user, onUpdate }) {
  const [status, setStatus] = useState(ticket.status || "Open");
  const [priority, setPriority] = useState(ticket.priority || "Medium");
  const [category, setCategory] = useState(
    ticket.category || "General Inquiry"
  );
  const [reply, setReply] = useState(ticket.adminResponse || "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [aiReason, setAiReason] = useState("");
  const [aiNextSteps, setAiNextSteps] = useState([]);

  async function analyzeWithAI() {
    if (aiLoading || saving) return;

    setAiLoading(true);
    setFeedback("");
    setAiReason("");
    setAiNextSteps([]);

    try {
      const analysis = await apiRequest("/api/ai/analyze-ticket", token, {
        method: "POST",
        body: JSON.stringify({
          subject: ticket.subject,
          message: ticket.message,
        }),
        timeoutMs: 90000,
      });

      if (analysis.category && CATEGORIES.includes(analysis.category)) {
        setCategory(analysis.category);
      }

      if (analysis.priority && PRIORITIES.includes(analysis.priority)) {
        setPriority(analysis.priority);
      }

      if (!analysis.suggestedReply) {
        throw new Error("AI response did not contain a suggested reply.");
      }

      setReply(analysis.suggestedReply);
      setAiReason(analysis.reason || "");
      setAiNextSteps(
        Array.isArray(analysis.nextSteps) ? analysis.nextSteps : []
      );
      setFeedback("AI draft ready. Review it before saving.");
    } catch (err) {
      setFeedback(`AI analysis failed: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  }

  async function save(changes, successMessage) {
    setSaving(true);
    setFeedback("");

    try {
      const ok = await onUpdate(ticket.id, changes);
      setFeedback(ok ? successMessage : "Save failed. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  async function assignToSelf() {
    if (!user?.name) {
      setFeedback("Could not identify the current admin.");
      return;
    }

    await save(
      { assignedTo: user.name },
      "Ticket assigned to you successfully."
    );
  }

  return (
    <article className="admin-ticket-card">
      <div className="admin-ticket-top">
        <div>
          <span className="ticket-id">{ticket.id}</span>
          <h4>{ticket.subject}</h4>
          <p>
            By <strong>{ticket.authorName || "Author"}</strong> ·{" "}
            {ticket.createdAt
              ? new Date(ticket.createdAt).toLocaleString("en-IN")
              : "—"}
          </p>
        </div>

        <span className={`priority-badge priority-${slug(priority)}`}>
          {priority}
        </span>
      </div>

      <div className="assignment-row">
        <div>
          <strong>Assigned to:</strong>{" "}
          {ticket.assignedTo || "Unassigned"}
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={assignToSelf}
          disabled={saving || aiLoading || ticket.assignedTo === user?.name}
        >
          {ticket.assignedTo === user?.name
            ? "Assigned to You"
            : "Assign to Self"}
        </button>
      </div>

      <div className="admin-ticket-message">
        <strong>Author's message</strong>
        <p>{ticket.message}</p>
      </div>

      <section className="ai-assistant-panel">
        <h4>AI Support Assistant</h4>
        <p>Classify the ticket and draft a policy-based reply.</p>

        <button
          type="button"
          className="primary ai-analyze-button"
          onClick={analyzeWithAI}
          disabled={aiLoading || saving}
        >
          {aiLoading ? "Analyzing..." : "✨ AI Analyze / Draft Reply"}
        </button>

        {aiReason && (
          <p>
            <strong>Reason:</strong> {aiReason}
          </p>
        )}

        {aiNextSteps.length > 0 && (
          <div>
            <strong>Suggested next steps</strong>
            <ul>
              {aiNextSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="admin-ticket-fields">
        <div>
          <label>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {PRIORITIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        className="primary admin-save-button"
        disabled={saving || aiLoading}
        onClick={() =>
          save(
            { status, priority, category },
            "Ticket details updated."
          )
        }
      >
        Save Ticket Details
      </button>

      <div className="admin-response-area">
        <label>Reply to Author</label>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={5}
          maxLength={5000}
          placeholder="Review and edit the reply before saving..."
        />

        <button
          type="button"
          className="primary"
          disabled={saving || aiLoading}
          onClick={() => {
            if (!reply.trim()) {
              setFeedback("Enter a reply before saving.");
              return;
            }

            save(
              { adminResponse: reply.trim() },
              "Reply saved successfully."
            );
          }}
        >
          Save Reply
        </button>
      </div>

      <div className="admin-response-area internal-note-area">
        <label>Internal Note (admin only)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Add a private note for your team..."
        />

        <button
          type="button"
          className="secondary-button"
          disabled={saving || aiLoading}
          onClick={async () => {
            if (!note.trim()) {
              setFeedback("Enter an internal note first.");
              return;
            }

            const currentNote = note.trim();
            await save(
              { internalNote: currentNote },
              "Internal note added."
            );
            setNote("");
          }}
        >
          Add Internal Note
        </button>

        {ticket.internalNotes?.length > 0 && (
          <div className="internal-notes-list">
            <strong>Saved internal notes</strong>
            {ticket.internalNotes.map((item, index) => (
              <p key={index}>
                {typeof item === "string" ? item : item.note}
              </p>
            ))}
          </div>
        )}
      </div>

      {feedback && (
        <p
          className={
            /failed|error|could not|enter a reply|timed out|not contain/i.test(
              feedback
            )
              ? "error"
              : "success"
          }
          role="status"
        >
          {feedback}
        </p>
      )}
    </article>
  );
}

function slug(value) {
  return String(value || "open")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export default App;
