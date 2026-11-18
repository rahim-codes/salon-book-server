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

  // ALL DATA GET

  app.get("/services", async (req, res) => {
    try {
      const services = await servicesCollection.find({}).toArray();
      res.status(200).json({
        success: true,
        data: services,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET SERVICE 6 ACTIVE DATA

  app.get("/services/featured", async (req, res) => {
    try {
      const activeServices = await servicesCollection
        .find({ status: "Active" })
        .limit(6)
        .toArray();

      res.status(200).json({
        success: true,
        data: activeServices,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

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
