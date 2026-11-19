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
  const appointmentsCollection = db.collection("appointments");

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

  // ==========================================
  // APPOINTMENTS API
  // ==========================================

  // POST APPOINTMENTS
  app.post("/appointments", async (req, res) => {
    try {
      const {
        serviceId,
        serviceName,
        category,
        price,
        duration,
        appointmentDate,
        timeSlot,
        message,
        image,
        customerEmail,
        customerName,
      } = req.body;

      if (!serviceId || !appointmentDate || !timeSlot) {
        return res.status(400).json({
          success: false,
          message: "Service, appointment date, and time slot are required.",
        });
      }

      if (!ObjectId.isValid(serviceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid service ID.",
        });
      }

      const service = await servicesCollection.findOne({
        _id: new ObjectId(serviceId),
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found.",
        });
      }

      if (service.status !== "Active") {
        return res.status(400).json({
          success: false,
          message:
            "Only active services are available for appointment booking.",
        });
      }

      const newAppointment = {
        serviceId: new ObjectId(serviceId),
        serviceName: serviceName || service.name,
        price: Number(price ?? service.price),
        duration: Number(duration ?? service.duration),
        appointmentDate,
        timeSlot,
        category: service.category,
        image: service.image,
        message: message?.trim() || "",
        customerName: customerName || "Guest Customer",
        customerEmail: customerEmail || "",
        status: "Pending", // Default: "Pending" | Allowed: "Pending" | "Confirmed" | "Cancelled"
        paymentStatus: "Unpaid", // Default: "Unpaid" | Allowed: "Unpaid" | "Paid"
        createdAt: new Date(),
      };

      const result = await appointmentsCollection.insertOne(newAppointment);

      res.status(201).json({
        success: true,
        message: "Appointment booked successfully!",
        data: { _id: result.insertedId, ...newAppointment },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // লগইন করা কাস্টমারের নিজের অ্যাপয়েন্টমেন্টগুলো আনা
  app.get("/appointments", async (req, res) => {
    try {
      const email = req.query.email?.trim().toLowerCase();

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Customer email is required to view appointments.",
        });
      }

      const appointments = await appointmentsCollection
        .find({ customerEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET DATA BY CUSTOMER EMAIL
  app.get("/appointments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const email = req.query.email?.trim().toLowerCase();

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid appointment ID." });
      }

      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!appointment) {
        return res
          .status(404)
          .json({ success: false, message: "Appointment not found." });
      }

      if (email && appointment.customerEmail?.toLowerCase() !== email) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own appointments.",
        });
      }

      res.status(200).json({ success: true, data: appointment });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.patch("/appointments/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;
      const customerEmail = req.body?.customerEmail?.trim().toLowerCase();

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid appointment ID." });
      }

      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!appointment) {
        return res
          .status(404)
          .json({ success: false, message: "Appointment not found." });
      }

      if (
        customerEmail &&
        appointment.customerEmail?.toLowerCase() !== customerEmail
      ) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized action on another customer's appointment.",
        });
      }

      if (appointment.status !== "Pending") {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel an appointment that is already ${appointment.status}.`,
        });
      }

      const updated = await appointmentsCollection.findOneAndUpdate(
        { _id: new ObjectId(id), status: "Pending" },
        { $set: { status: "Cancelled", updatedAt: new Date() } },
        { returnDocument: "after" },
      );

      res.status(200).json({
        success: true,
        message: "Appointment cancelled successfully.",
        data: updated,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.patch("/appointments/:id/pay", async (req, res) => {
    try {
      const { id } = req.params;
      const customerEmail = req.body?.customerEmail?.trim().toLowerCase();

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid appointment ID." });
      }

      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!appointment) {
        return res
          .status(404)
          .json({ success: false, message: "Appointment not found." });
      }

      if (
        customerEmail &&
        appointment.customerEmail?.toLowerCase() !== customerEmail
      ) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized payment attempt.",
        });
      }

      if (appointment.status !== "Confirmed") {
        return res.status(400).json({
          success: false,
          message: "Payment is only allowed for Confirmed appointments.",
        });
      }

      if (appointment.paymentStatus === "Paid") {
        return res.status(400).json({
          success: false,
          message: "This appointment is already paid.",
        });
      }

      const updated = await appointmentsCollection.findOneAndUpdate(
        {
          _id: new ObjectId(id),
          status: "Confirmed",
          paymentStatus: "Unpaid",
        },
        {
          $set: {
            paymentStatus: "Paid",
            paidAt: new Date(),
          },
        },
        { returnDocument: "after" },
      );

      res.status(200).json({
        success: true,
        message: "Payment completed successfully!",
        data: updated,
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
