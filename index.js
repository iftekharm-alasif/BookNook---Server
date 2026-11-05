
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

  // Home
  app.get("/", (req, res) => {
    res.send("BookNook Server is Running!");
  });

  // Add Book

  // Add Book
  app.post("/books", async (req, res) => {
    try {
      const book = {
        ...req.body,
        totalCopies: Number(req.body.totalCopies),
        availableCopies: Number(req.body.availableCopies),
      };

      const result = await booksCollection.insertOne(book);

      res.status(201).send({
        message: "Book Added Successfully!",
        insertedId: result.insertedId,
      });

    } catch (error) {
      console.log("Add Book Error:", error);

      res.status(500).send({
        message: "Failed to add book",
      });
    }
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

  // Get Single Book
  app.get("/books/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid Book ID" });
      }

      const book = await booksCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!book) {
        return res.status(404).send({ message: "Book not found" });
      }

      res.send(book);
    } catch (error) {
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // Delete Book
app.delete("/books/:id", async (req, res) => {
  const id = req.params.id;

  const result = await booksCollection.deleteOne({
    _id: new ObjectId(id),
  });

  res.send({
    message: "Book Deleted Successfully!",
  });
});

// Update Book
app.put("/books/:id", async (req, res) => {
  const id = req.params.id;

  const updatedBook = {
    title: req.body.title,
    author: req.body.author,
    category: req.body.category,
    image: req.body.image,
    description: req.body.description,
    totalCopies: Number(req.body.totalCopies),
    availableCopies: Number(req.body.availableCopies),
  };

  const result = await booksCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedBook }
  );

  res.send({
    message: "Book Updated Successfully!",
  });
});

  // Borrow Book
  app.post("/borrow/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const email = req.body.email?.trim().toLowerCase();

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid Book ID" });
      }

      if (!email) {
        return res.status(400).send({ message: "Email is required!" });
      }

      // Check if this user already borrowed this book
      const alreadyBorrowed = await borrowsCollection.findOne(
        {
          bookId: id,
          status: { $regex: /^borrowed$/i },
          $or: [{ email }, { borrowerEmail: email }],
        },
        { collation: { locale: "en", strength: 2 } }
      );

      if (alreadyBorrowed) {
        return res.status(409).send({
          message: "You have already borrowed this book!",
        });
      }

      // Reduce available copies only if copies are available
      const result = await booksCollection.updateOne(
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
          message: "Book Not Available!",
        });
      }

      // Get book information
      const book = await booksCollection.findOne({
        _id: new ObjectId(id),
      });

      try {
        // Save borrow record
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
      } catch (error) {
        // Restore copy if saving borrow record fails
        await booksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { availableCopies: 1 } }
        );

        throw error;
      }

      res.send({ message: "Book Borrowed Successfully!" });
    } catch (error) {
      console.error("Borrow Error:", error);
      res.status(500).send({ message: "Failed to borrow book" });
    }
  });

  // My Borrows
  app.get("/my-borrows", async (req, res) => {
    try {
      const email = req.query.email?.trim().toLowerCase();

      if (!email) {
        return res.status(400).send({ message: "Email is required!" });
      }

      const borrows = await borrowsCollection
        .find({
          $or: [{ email }, { borrowerEmail: email }],
        })
        .collation({ locale: "en", strength: 2 })
        .toArray();

      const books = [];

      for (const borrow of borrows) {
        const bookId = borrow.bookId;

        const book = ObjectId.isValid(bookId)
          ? await booksCollection.findOne({
              _id: new ObjectId(bookId),
            })
          : null;

        books.push({
          ...borrow,
          bookId: String(bookId),
          author: borrow.author || book?.author || "",
          category: borrow.category || book?.category || "",
          image: borrow.image || book?.image || "",
          borrowDate: borrow.borrowDate || "",
          returnDate: borrow.returnDate || "",
          status:
            borrow.status?.toLowerCase() === "returned"
              ? "Returned"
              : "Borrowed",
        });
      }

      res.send(books);
    } catch (error) {
      console.error("My Borrows Error:", error);
      res.status(500).send({ message: "Failed to get borrowed books" });
    }
  });

  // Return Book
  app.patch("/return/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid Borrow ID" });
      }

      const borrow = await borrowsCollection.findOne({
        _id: new ObjectId(id),
        status: { $regex: /^borrowed$/i },
      });

      if (!borrow) {
        return res.status(404).send({
          message: "Borrow Record Not Found!",
        });
      }

      const result = await borrowsCollection.updateOne(
        {
          _id: new ObjectId(id),
          status: { $regex: /^borrowed$/i },
        },
        {
          $set: { status: "Returned" },
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(400).send({
          message: "Book already returned!",
        });
      }

      const bookId = borrow.bookId;

      if (ObjectId.isValid(bookId)) {
        await booksCollection.updateOne(
          { _id: new ObjectId(bookId) },
          { $inc: { availableCopies: 1 } }
        );
      }

      res.send({ message: "Book Returned Successfully!" });
    } catch (error) {
      console.error("Return Error:", error);
      res.status(500).send({ message: "Failed to return book" });
    }
  });

  // Start Server
  app.listen(8000, () => {
    console.log("Server running on port 8000");
  });
}

connectDB().catch(console.error);
