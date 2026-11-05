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

  // Start server
  app.listen(8000, () => {
    console.log("Server running on port 8000");
  });
}

connectDB();
