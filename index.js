import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

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

  // GET SINGLE SERVICE DATA

  app.get("/services/:id", async (req, res) => {
    try {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid ID format" });
      }

      const service = await servicesCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!service) {
        return res
          .status(404)
          .json({ success: false, message: "Service not found" });
      }

      res.status(200).json({ success: true, data: service });
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

  // UPDATE SERVICE DATA
  app.patch("/services/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid service ID format.",
        });
      }

      const { name, category, description, price, duration, image, status } =
        req.body;
      const numericPrice = Number(price);
      const numericDuration = Number(duration);

      if (Number.isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "Price must be a positive number.",
        });
      }

      if (Number.isNaN(numericDuration) || numericDuration <= 0) {
        return res.status(400).json({
          success: false,
          message: "Duration must be a positive number.",
        });
      }

      const updateDoc = {
        $set: {
          name: name.trim(),
          category: category.trim(),
          description: description?.trim() || "",
          price: numericPrice,
          duration: numericDuration,
          ...(image ? { image } : {}),
          status: status === "Inactive" ? "Inactive" : "Active",
          updatedAt: new Date(),
        },
      };

      const result = await servicesCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        updateDoc,
        { returnDocument: "after" },
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Service not found.",
        });
      }

      res.status(200).json({
        success: true,
        message: "Service updated successfully!",
        data: result,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // DELETE SERVICE

  app.delete("/services/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid service ID format.",
        });
      }

      const result = await servicesCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Service not found.",
        });
      }

      res.status(200).json({
        success: true,
        message: "Service deleted successfully!",
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
  });
}

run();
