import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

// Start server
app.listen(8000, () => {
  console.log("Server running on port 8000");
});
