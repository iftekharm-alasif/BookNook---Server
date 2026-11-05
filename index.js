import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

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

  // Start server after database connection
  app.listen(8000, () => {
    console.log("Server running on port 8000");
  });
}

connectDB();
