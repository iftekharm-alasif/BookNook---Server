
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import { verifyToken } from "./middleware/verifyToken.js";

const app = express();
const PORT = process.env.PORT || 8000;

const client = new MongoClient(process.env.MONGODB_URL);

app.use(cors());
app.use(express.json());

let db;

async function connectToMongoDB() {
  if (!db) {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    db = client.db("booknook");
  }
  return db;
}

// Home
app.get("/", (req, res) => {
  res.send({ message: "BookNook Server is running fine!" });
});

// JWT Test
app.get("/api/protected", verifyToken, (req, res) => {
  res.send({ success: true, message: "Token verified!" });
});

// Add Book
app.post("/books", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const result = await database.collection("books").insertOne(req.body);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to add book" });
  }
});

// All Books
app.get("/allbooks", async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const result = await database.collection("books").find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch books" });
  }
});

// Recent Books
app.get("/recentbooks", async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const result = await database.collection("books")
      .find()
      .sort({ _id: -1 })
      .limit(6)
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch recent books" });
  }
});

// Single Book
app.get("/books/:id", async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const result = await database.collection("books").findOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch book" });
  }
});

// Delete Book
app.delete("/books/:id", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const result = await database.collection("books").deleteOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to delete book" });
  }
});

// Update Book
app.patch("/books/:id", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const result = await database.collection("books").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to update book" });
  }
});

// Borrow Book
app.post("/borrow/:id", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const books = database.collection("books");
    const borrows = database.collection("borrows");

    const bookId = req.params.id;
    const email = req.user.email;

    const existingBorrow = await borrows.findOne({
      bookId,
      email,
      status: "Borrowed",
    });

    if (existingBorrow) {
      return res.status(400).send({ message: "Already borrowed" });
    }

    const book = await books.findOne({
      _id: new ObjectId(bookId),
    });

    if (!book || book.availableCopies <= 0) {
      return res.status(400).send({ message: "Book not available" });
    }

    await books.updateOne(
      { _id: new ObjectId(bookId) },
      { $inc: { availableCopies: -1 } }
    );

    const result = await borrows.insertOne({
      bookId,
      email,
      title: book.title,
      author: book.author,
      category: book.category,
      image: book.image,
      borrowDate: req.body.borrowDate,
      returnDate: req.body.returnDate,
      status: "Borrowed",
    });

    res.send(result);
  } catch (error) {
    console.error("Borrow Error:", error);
    res.status(500).send({ message: "Failed to borrow book" });
  }
});

// My Borrows
app.get("/my-borrows", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const result = await database.collection("borrows")
      .find({ email: req.user.email })
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch borrowed books" });
  }
});

// Return Book
app.patch("/return/:id", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const borrows = database.collection("borrows");
    const books = database.collection("books");

    const borrow = await borrows.findOne({
      _id: new ObjectId(req.params.id),
      email: req.user.email,
      status: "Borrowed",
    });

    if (!borrow) {
      return res.status(404).send({ message: "Borrow record not found" });
    }

    await borrows.updateOne(
      { _id: borrow._id },
      { $set: { status: "Returned" } }
    );

    await books.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      { $inc: { availableCopies: 1 } }
    );

    res.send({ success: true, message: "Book returned successfully" });
  } catch (error) {
    res.status(500).send({ message: "Failed to return book" });
  }
});

// Local Server
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`);
  });
}

export default app;
