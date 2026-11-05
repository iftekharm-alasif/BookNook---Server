import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URL);

async function connectDB() {
  await client.connect();

  console.log("MongoDB Connected!");

  const db = client.db("booknook");
  const booksCollection = db.collection("books");
  const borrowsCollection = db.collection("borrows");

// Prevent duplicate active borrows by the same user
await borrowsCollection.createIndex(
  { bookId: 1, borrowerEmail: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "borrowed" },
  }
);

  // Home route
  app.get("/", (req, res) => {
    res.send("BookNook Server is Running!");
  });

  // Add Book
  app.post("/books", async (req, res) => {
    const book = req.body;

    const result = await booksCollection.insertOne(book);

    res.send({
      message: "Book Added Successfully!",
      insertedId: result.insertedId,
    });
  });

  // All Books
  app.get("/allbooks", async (req, res) => {
    const result = await booksCollection
      .find()
      .sort({ _id: -1 })
      .toArray();

    res.send(result);
  });

  // Recent Books
  app.get("/recentbooks", async (req, res) => {
    const result = await booksCollection
      .find()
      .sort({ _id: -1 })
      .limit(10)
      .toArray();

    res.send(result);
  });

  // Get Single Book by ID
  app.get("/books/:id", async (req, res) => {
    try {
      const { id } = req.params;

      console.log("Requested Book ID:", id);

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid Book ID",
        });
      }

      const book = await booksCollection.findOne({
        $or: [
          { _id: new ObjectId(id) },
          { _id: id },
        ],
      });

      if (!book) {
        return res.status(404).send({
          message: "Book not found",
          requestedId: id,
        });
      }

      res.status(200).send(book);
    } catch (error) {
      console.error("Single Book API Error:", error);

      res.status(500).send({
        message: "Internal Server Error",
      });
    }
  });

  // Borrow Book
app.post("/borrow/:id", async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;

  const book = await booksCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!book || book.availableCopies <= 0) {
    return res.send({
      message: "Book Not Available!",
    });
  }

  await booksCollection.updateOne(
    { _id: new ObjectId(id) },
    { $inc: { availableCopies: -1 } }
  );

await borrowsCollection.insertOne({
  bookId: id,
  title: book.title,
  author: book.author,
  category: book.category,
  image: book.image,
  email,
  borrowDate: new Date().toISOString(),
  returnDate: new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000
  ).toISOString(),
  status: "Borrowed",
});
  res.send({
    message: "Book Borrowed Successfully!",
  });
});

// My Borrows
app.get("/my-borrows", async (req, res) => {
  const { email } = req.query;

  const borrows = await borrowsCollection
    .find({ email })
    .toArray();

  const books = [];

  for (const borrow of borrows) {
    const book = await booksCollection.findOne({
      _id: new ObjectId(borrow.bookId),
    });

    books.push({
      ...borrow,
      author: borrow.author || book?.author,
      category: borrow.category || book?.category,
      image: borrow.image || book?.image,
      borrowDate: borrow.borrowDate || new Date().toISOString(),
      returnDate:
        borrow.returnDate ||
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status:
        borrow.status.toLowerCase() === "borrowed"
          ? "Borrowed"
          : "Returned",
    });
  }

  res.send(books);
});

// Return Book
app.patch("/return/:id", async (req, res) => {
  const { id } = req.params;

  const borrow = await borrowsCollection.findOne({
    _id: new ObjectId(id),
    status: { $in: ["Borrowed", "borrowed"] },
  });

  if (!borrow) {
    return res.send({
      message: "Borrow Record Not Found!",
    });
  }

  await borrowsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "Returned" } }
  );

  await booksCollection.updateOne(
    { _id: new ObjectId(borrow.bookId) },
    { $inc: { availableCopies: 1 } }
  );

  res.send({
    message: "Book Returned Successfully!",
  });
});
  // Start server
  app.listen(8000, () => {
    console.log("Server running on port 8000");
  });
}

connectDB();
