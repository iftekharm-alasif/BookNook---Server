
import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import { verifyToken } from "./middleware/verifyToken.js";

const app = express();
const PORT = 8000;

const client = new MongoClient(process.env.MONGODB_URL);

app.use(cors());
app.use(express.json());

async function connectDB() {
  await client.connect();
  console.log("MongoDB Connected!");

  const db = client.db("booknook");
  const books = db.collection("books");
  const borrows = db.collection("borrows");

  // Home
  app.get("/", (req, res) => {
    res.send("BookNook Server is Running!");
  });

  // JWT Test
  app.get("/api/protected", verifyToken, (req, res) => {
    res.send({ success: true, user: req.user });
  });

  // Add Book
  app.post("/books", verifyToken, async (req, res) => {
    const book = {
      ...req.body,
      totalCopies: Number(req.body.totalCopies),
      availableCopies: Number(req.body.availableCopies),
      username: req.user.name,
      email: req.user.email.toLowerCase(),
    };

    const result = await books.insertOne(book);
    res.send(result);
  });

  // All Books
  app.get("/allbooks", async (req, res) => {
    const result = await books.find().sort({ _id: -1 }).toArray();
    res.send(result);
  });

  // Recent Books
  app.get("/recentbooks", async (req, res) => {
    const result = await books.find().sort({ _id: -1 }).limit(10).toArray();
    res.send(result);
  });

  // Single Book
  app.get("/books/:id", async (req, res) => {
    const result = await books.findOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  });

  // Delete Book
  app.delete("/books/:id", verifyToken, async (req, res) => {
    const result = await books.deleteOne({
      _id: new ObjectId(req.params.id),
      email: req.user.email.toLowerCase(),
    });

    res.send(result);
  });

  // Update Book
  app.put("/books/:id", verifyToken, async (req, res) => {
    const data = {
      ...req.body,
      totalCopies: Number(req.body.totalCopies),
      availableCopies: Number(req.body.availableCopies),
    };

    const result = await books.updateOne(
      {
        _id: new ObjectId(req.params.id),
        email: req.user.email.toLowerCase(),
      },
      { $set: data }
    );

    res.send(result);
  });
// Borrow Book
app.post("/borrow/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const email = req.user.email.toLowerCase();

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID!",
      });
    }

    const alreadyBorrowed = await borrows.findOne({
      bookId: id,
      email,
      status: "Borrowed",
    });

    if (alreadyBorrowed) {
      return res.status(409).send({
        message: "Already borrowed!",
      });
    }

    const book = await books.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found!",
      });
    }

    if (book.availableCopies <= 0) {
      return res.status(400).send({
        message: "Book not available!",
      });
    }

    const result = await books.updateOne(
      {
        _id: new ObjectId(id),
        availableCopies: { $gt: 0 },
      },
      {
        $inc: { availableCopies: -1 },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).send({
        message: "Book not available!",
      });
    }

    try {
      await borrows.insertOne({
        bookId: id,
        title: book.title,
        author: book.author,
        category: book.category,
        image: book.image,
        email,
        borrowDate: new Date().toISOString(),
        returnDate: new Date(
          Date.now() + 14 * 86400000
        ).toISOString(),
        status: "Borrowed",
      });
    } catch (error) {
      await books.updateOne(
        { _id: new ObjectId(id) },
        { $inc: { availableCopies: 1 } }
      );

      throw error;
    }

    res.send({
      message: "Book Borrowed Successfully!",
    });
  } catch (error) {
    console.error("Borrow Error:", error);

    res.status(500).send({
      message: "Failed to borrow book",
    });
  }
});

  // My Borrows
  app.get("/my-borrows", verifyToken, async (req, res) => {
    const result = await borrows.find({
      email: req.user.email.toLowerCase(),
    }).toArray();

    res.send(result);
  });

  // Return Book
  app.patch("/return/:id", verifyToken, async (req, res) => {
    const id = req.params.id;

    const borrow = await borrows.findOne({
      _id: new ObjectId(id),
      email: req.user.email.toLowerCase(),
      status: "Borrowed",
    });

    if (!borrow) {
      return res.status(404).send({ message: "Borrow not found!" });
    }

    await borrows.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "Returned" } }
    );

    await books.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      { $inc: { availableCopies: 1 } }
    );

    res.send({ message: "Book Returned Successfully!" });
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

connectDB().catch(console.error);

export default app;
