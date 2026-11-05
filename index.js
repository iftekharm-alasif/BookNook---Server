import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Start server
app.listen(8000, () => {
  console.log("Server running on port 8000");
});
