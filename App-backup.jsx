
function TicketForm() {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("General Inquiry");
  const [message, setMessage] = useState("");
  const [authorName, setAuthorName] = useState("Kanishka Sharma");
  const [bookId, setBookId] = useState("");
  const [books, setBooks] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    fetch("http://localhost:5000/api/books")
      .then((response) => {
        if (!response.ok) throw new Error("Books could not be loaded.");
        return response.json();
      })
      .then((data) => setBooks(data.books || []))
      .catch(() => setBooks([]));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback("");
    setIsError(false);

    try {
      const response = await fetch("http://localhost:5000/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authorName,
          subject,
          category,
          message,
          bookId: bookId || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Ticket could not be submitted.");
      }

      setFeedback(`Ticket created successfully! Ticket ID: ${data.ticket.id}`);
      setSubject("");
      setMessage("");
      setCategory("General Inquiry");
      setBookId("");
    } catch (error) {
      setIsError(true);
      setFeedback(
        error.message || "Could not connect to the backend. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel ticket-panel">
      <h3>Create a Support Ticket</h3>
      <p>Tell our team how we can help you.</p>

      <form onSubmit={handleSubmit}>
        <label>Author Name</label>
        <input
          value={authorName}
          onChange={(event) => setAuthorName(event.target.value)}
          placeholder="Enter author name"
          required
        />

        <label>Related Book (optional)</label>
        <select
          value={bookId}
          onChange={(event) => setBookId(event.target.value)}
        >
          <option value="">General inquiry / no specific book</option>
          {books.map((book) => (
            <option key={book.id} value={String(book.id)}>
              {book.title}
            </option>
          ))}
        </select>

        <label>Subject</label>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Enter ticket subject"
          required
        />

        <label>Category</label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option>Royalty &amp; Payments</option>
          <option>ISBN &amp; Metadata Issues</option>
          <option>Printing &amp; Quality</option>
          <option>Distribution &amp; Availability</option>
          <option>Book Status &amp; Production Updates</option>
          <option>General Inquiry</option>
        </select>

        <label>Message</label>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Describe your issue..."
          rows="5"
          required
        />

        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Ticket"}
        </button>
      </form>

      {feedback && (
        <p role="status" className={isError ? "error" : "success"}>
          {feedback}
        </p>
      )}
    </section>
  );
}
