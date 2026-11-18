import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { MongoClient, ServerApiVersion } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  await client.connect();
  console.log("✅ Successfully connected to MongoDB!");

  const db = client.db("salonbook_db");
  const servicesCollection = db.collection("services");

  app.get("/", (req, res) => {
    res.send("SalonBook Server is Running!");
  });

  // ==========================================
  // SERVICE API
  // ==========================================

  // ADD SERVICE
  app.post("/services", async (req, res) => {
    const newService = {
      ...req.body,
      createdAt: new Date(),
    };

    const result = await servicesCollection.insertOne(newService);
    res.status(201).json({
      success: true,
      message: "Service added successfully!",
      data: result,
    });
  });

  app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
  });
}

run();
