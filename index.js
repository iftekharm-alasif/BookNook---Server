
import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import { verifyToken } from "./middleware/verifyToken.js";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

let client;
let dbPromise;

async function connectDB() {
  const uri = process.env.MONGODB_URL;

  if (!uri) {
    throw new Error("MONGODB_URL environment variable is missing");
  }

  if (!dbPromise) {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    dbPromise = client
      .connect()
      .then(() => {
        console.log("MongoDB Connected!");
        return client.db("booknook");
      })
      .catch((error) => {
        client = undefined;
        dbPromise = undefined;
        throw error;
      });
  }

  return dbPromise;
}

// Home
app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

// JWT Test
app.get("/api/protected", verifyToken, (req, res) => {
  res.send({
    success: true,
    user: req.user,
  });
});

// Add Book
app.post("/books", verifyToken, async (req, res, next) => {
  try {
    const db = await connectDB();
    const books = db.collection("books");

    const book = {
      ...req.body,
      totalCopies: Number(req.body.totalCopies),
      availableCopies: Number(req.body.availableCopies),
      username: req.user.name,
      email: req.user.email.toLowerCase(),
    };

    const result = await books.insertOne(book);

    res.send(result);
  } catch (error) {
    next(error);
  }
});

// All Books
app.get("/allbooks", async (req, res, next) => {
  try {
    const db = await connectDB();
    const result = await db
      .collection("books")
      .find()
      .sort({ _id: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    next(error);
  }
});

// Recent Books
app.get("/recentbooks", async (req, res, next) => {
  try {
    const db = await connectDB();
    const result = await db
      .collection("books")
      .find()
      .sort({ _id: -1 })
      .limit(10)
      .toArray();

    res.send(result);
  } catch (error) {
    next(error);
  }
});

// Single Book
app.get("/books/:id", async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: "Invalid book ID!" });
    }

    const db = await connectDB();
    const result = await db.collection("books").findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!result) {
      return res.status(404).send({ message: "Book not found!" });
    }

    res.send(result);
  } catch (error) {
    next(error);
  }
});

// Delete Book
app.delete("/books/:id", verifyToken, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: "Invalid book ID!" });
    }

    const db = await connectDB();
    const result = await db.collection("books").deleteOne({
      _id: new ObjectId(req.params.id),
      email: req.user.email.toLowerCase(),
    });

    res.send(result);
  } catch (error) {
    next(error);
  }
});

// Update Book
app.put("/books/:id", verifyToken, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: "Invalid book ID!" });
    }

    const db = await connectDB();

    const data = {
      ...req.body,
      totalCopies: Number(req.body.totalCopies),
      availableCopies: Number(req.body.availableCopies),
    };

    const result = await db.collection("books").updateOne(
      {
        _id: new ObjectId(req.params.id),
        email: req.user.email.toLowerCase(),
      },
      { $set: data }
    );

    res.send(result);
  } catch (error) {
    next(error);
  }
});

// Borrow Book
app.post("/borrow/:id", verifyToken, async (req, res, next) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID!",
      });
    }

    const db = await connectDB();
    const books = db.collection("books");
    const borrows = db.collection("borrows");
    const email = req.user.email.toLowerCase();

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
    next(error);
  }
});

// My Borrows
app.get("/my-borrows", verifyToken, async (req, res, next) => {
  try {
    const db = await connectDB();

    const result = await db.collection("borrows").find({
      email: req.user.email.toLowerCase(),
    }).toArray();

    res.send(result);
  } catch (error) {
    next(error);
  }
});

// Return Book
app.patch("/return/:id", verifyToken, async (req, res, next) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid borrow ID!",
      });
    }

    const db = await connectDB();
    const borrows = db.collection("borrows");
    const books = db.collection("books");

    const borrow = await borrows.findOne({
      _id: new ObjectId(id),
      email: req.user.email.toLowerCase(),
      status: "Borrowed",
    });

    if (!borrow) {
      return res.status(404).send({
        message: "Borrow not found!",
      });
    }

    await borrows.updateOne(
      {
        _id: new ObjectId(id),
        status: "Borrowed",
      },
      {
        $set: { status: "Returned" },
      }
    );

    await books.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      { $inc: { availableCopies: 1 } }
    );

    res.send({
      message: "Book Returned Successfully!",
    });
  } catch (error) {
    next(error);
  }
});

// Error Handler
app.use((error, req, res, next) => {
  console.error("API Error:", error);

  res.status(500).send({
    success: false,
    message: "Internal Server Error",
  });
});

// Local Development Only
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
