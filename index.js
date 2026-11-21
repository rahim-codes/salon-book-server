import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import Stripe from "stripe";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
  const usersCollection = db.collection("user");
  const transactionsCollection = db.collection("transactions");

  app.get("/", (req, res) => {
    res.send("SalonBook Server is Running!");
  });

  //Blocked user middleware
  const verifyNotBlocked = async (req, res, next) => {
    try {
      const email = (
        req.user?.email ||
        req.headers["x-user-email"] ||
        req.body?.customerEmail ||
        req.body?.actorEmail ||
        req.query?.email ||
        ""
      )
        .toString()
        .trim()
        .toLowerCase();

      if (!email) return next();

      const user = await usersCollection.findOne({ email });
      if (user && user.blocked) {
        return res.status(403).json({
          success: false,
          blocked: true,
          message: "Your account has been blocked by the administrator.",
        });
      }

      next();
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

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

  app.get("/services/:id", verifyNotBlocked, async (req, res) => {
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
  app.post("/appointments", verifyNotBlocked, async (req, res) => {
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

  // get appointments data for admin and customer
  app.get("/appointments", verifyNotBlocked, async (req, res) => {
    try {
      const email = req.query.email?.trim().toLowerCase();
      const filter = email ? { customerEmail: email } : {};

      const appointments = await appointmentsCollection
        .find(filter)
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
  app.get("/appointments/:id", verifyNotBlocked, async (req, res) => {
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

  app.patch("/appointments/:id/cancel", verifyNotBlocked, async (req, res) => {
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

  app.patch("/appointments/:id/pay", verifyNotBlocked, async (req, res) => {
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

  // APPOINTMENT API FOR ADMIN

  // admin can Pending appointment Confirm
  app.patch("/appointments/:id/confirm", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment ID.",
        });
      }

      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found.",
        });
      }

      if (appointment.status !== "Pending") {
        return res.status(400).json({
          success: false,
          message: `Only pending appointments can be confirmed. Current status: ${appointment.status}.`,
        });
      }

      const updated = await appointmentsCollection.findOneAndUpdate(
        { _id: new ObjectId(id), status: "Pending" },
        { $set: { status: "Confirmed", confirmedAt: new Date() } },
        { returnDocument: "after" },
      );

      res.status(200).json({
        success: true,
        message: "Appointment confirmed successfully!",
        data: updated,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin Pending or Confirmed appointments Cancel
  app.patch("/appointments/:id/admin-cancel", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment ID.",
        });
      }

      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found.",
        });
      }

      if (appointment.status === "Cancelled") {
        return res.status(400).json({
          success: false,
          message: "This appointment is already cancelled.",
        });
      }

      if (
        appointment.status !== "Pending" &&
        appointment.status !== "Confirmed"
      ) {
        return res.status(400).json({
          success: false,
          message: "Only pending or confirmed appointments can be cancelled.",
        });
      }

      const updated = await appointmentsCollection.findOneAndUpdate(
        {
          _id: new ObjectId(id),
          status: { $in: ["Pending", "Confirmed"] },
        },
        { $set: { status: "Cancelled", cancelledAt: new Date() } },
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

  // ==========================================
  // USER MANAGE API
  // ==========================================

  app.get("/profile", async (req, res) => {
    try {
      const email = (
        req.user?.email ||
        req.headers["x-user-email"] ||
        req.query.email ||
        ""
      )
        .toString()
        .trim()
        .toLowerCase();

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized. Please sign in to view your profile.",
        });
      }

      const user = await usersCollection.findOne(
        { email },
        { projection: { password: 0 } },
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User profile not found.",
        });
      }

      res.status(200).json({
        success: true,
        data: {
          _id: user._id,
          name: user.name || "",
          email: user.email,
          image: user.image || "",
          phone: user.phone || "",
          role: user.role || "customer",
          blocked: Boolean(user.blocked),
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.patch("/profile", async (req, res) => {
    try {
      const actorEmail = (
        req.user?.email ||
        req.headers["x-user-email"] ||
        req.body?.actorEmail ||
        ""
      )
        .toString()
        .trim()
        .toLowerCase();

      const targetEmail = (req.body?.targetEmail || actorEmail || "")
        .toString()
        .trim()
        .toLowerCase();

      if (!actorEmail) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized. Please sign in first.",
        });
      }

      if (targetEmail && targetEmail !== actorEmail) {
        return res.status(403).json({
          success: false,
          message: "Forbidden. You can only update your own profile.",
        });
      }

      if (
        "role" in req.body ||
        "blocked" in req.body ||
        "isBlocked" in req.body
      ) {
        return res.status(403).json({
          success: false,
          message: "You cannot modify your role or blocked status.",
        });
      }

      const { name, image, phone } = req.body;

      if (!name || !name.toString().trim()) {
        return res.status(400).json({
          success: false,
          message: "Name is required.",
        });
      }

      const cleanPhone = phone ? phone.toString().trim() : "";
      const cleanImage = image ? image.toString().trim() : "";

      const existingUser = await usersCollection.findOne({ email: actorEmail });
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "User account not found.",
        });
      }

      if (existingUser.blocked) {
        return res.status(403).json({
          success: false,
          message: "Your account is currently blocked.",
        });
      }

      const updatedDoc = await usersCollection.findOneAndUpdate(
        { email: actorEmail },
        {
          $set: {
            name: name.toString().trim(),
            image: cleanImage,
            phone: cleanPhone,
            updatedAt: new Date(),
          },
        },
        {
          returnDocument: "after",
          projection: { password: 0 },
        },
      );

      res.status(200).json({
        success: true,
        message: "Profile updated successfully!",
        data: {
          _id: updatedDoc._id,
          name: updatedDoc.name || "",
          email: updatedDoc.email,
          image: updatedDoc.image || "",
          phone: updatedDoc.phone || "",
          role: updatedDoc.role || "customer",
          blocked: Boolean(updatedDoc.blocked),
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/users", async (req, res) => {
    try {
      const customers = await usersCollection
        .find(
          { role: { $nin: ["admin", "Admin"] } },
          { projection: { password: 0 } },
        )
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        data: customers,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.patch("/users/:id/block-status", async (req, res) => {
    try {
      const { id } = req.params;
      const { blocked } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID.",
        });
      }

      if (typeof blocked !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "Blocked status must be true or false.",
        });
      }

      const targetUser = await usersCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      if (targetUser.role === "admin" || targetUser.role === "Admin") {
        return res.status(403).json({
          success: false,
          message: "Admin accounts cannot be blocked.",
        });
      }

      const updated = await usersCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            blocked,
            updatedAt: new Date(),
          },
        },
        {
          returnDocument: "after",
          projection: { password: 0 },
        },
      );

      res.status(200).json({
        success: true,
        message: blocked
          ? `${updated.name || updated.email} has been blocked.`
          : `${updated.name || updated.email} has been unblocked.`,
        data: updated,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==========================================
  // TRANSACTIONS API
  // ==========================================

  async function finalizeVerifiedPayment(session) {
    if (!session || session.payment_status !== "paid") return null;

    const appointmentId = session.metadata?.appointmentId;
    if (!appointmentId || !ObjectId.isValid(appointmentId)) return null;

    const transactionId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.id;

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(appointmentId),
    });
    if (!appointment) return null;

    // ১. অ্যাপয়েন্টমেন্ট Paid আপডেট
    await appointmentsCollection.updateOne(
      { _id: new ObjectId(appointmentId) },
      {
        $set: {
          paymentStatus: "Paid",
          paidAt: new Date(),
          transactionId,
        },
      },
    );

    // ২. Atomic Upsert: একই stripeSessionId থাকলে নতুন করে ইনসার্ট হবে না
    const txDoc = {
      appointmentId: new ObjectId(appointmentId),
      transactionId,
      stripeSessionId: session.id,
      customerName:
        session.metadata?.customerName ||
        appointment.customerName ||
        "Customer",
      customerEmail:
        session.metadata?.customerEmail ||
        appointment.customerEmail ||
        session.customer_email ||
        "",
      serviceName: appointment.serviceName,
      amount: session.amount_total
        ? Number(session.amount_total / 100)
        : Number(appointment.price),
      currency: (session.currency || "bdt").toUpperCase(),
      paymentMethod: "Stripe",
      paymentStatus: "Paid",
      createdAt: new Date(),
    };

    await transactionsCollection.updateOne(
      { stripeSessionId: session.id },
      { $setOnInsert: txDoc },
      { upsert: true },
    );

    return await transactionsCollection.findOne({
      stripeSessionId: session.id,
    });
  }

  // Stripe Webhook (express.json() এর আগে রাখবেন)
  app.post(
    "/webhook/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(200).json({ received: true, skipped: true });
      }

      try {
        const signature = req.headers["stripe-signature"];
        const event = stripe.webhooks.constructEvent(
          req.body,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET,
        );

        if (event.type === "checkout.session.completed") {
          await finalizeVerifiedPayment(event.data.object);
        }

        return res.status(200).json({ received: true });
      } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    },
  );

  // Checkout Session তৈরি করা (শুধু Confirmed ও Unpaid অ্যাপয়েন্টমেন্টের জন্য)
  app.post("/payments/create-checkout-session", async (req, res) => {
    try {
      const { appointmentId, customerEmail } = req.body;

      if (!appointmentId || !ObjectId.isValid(appointmentId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid appointment ID." });
      }

      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(appointmentId),
      });

      if (!appointment) {
        return res
          .status(404)
          .json({ success: false, message: "Appointment not found." });
      }

      if (
        customerEmail &&
        appointment.customerEmail &&
        appointment.customerEmail.toLowerCase() !==
          customerEmail.trim().toLowerCase()
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only pay for your own appointment.",
        });
      }

      if (appointment.status !== "Confirmed") {
        return res.status(400).json({
          success: false,
          message: "Only confirmed appointments can be paid.",
        });
      }

      if (appointment.paymentStatus === "Paid") {
        return res
          .status(400)
          .json({ success: false, message: "Already paid." });
      }

      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: appointment.customerEmail || customerEmail,
        line_items: [
          {
            price_data: {
              currency: "bdt",
              product_data: {
                name: appointment.serviceName,
                description: `${appointment.appointmentDate} (${appointment.timeSlot})`,
              },
              unit_amount: Math.round(Number(appointment.price) * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          appointmentId: appointment._id.toString(),
          customerName: appointment.customerName || "Customer",
          customerEmail: appointment.customerEmail || customerEmail || "",
        },
        success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/payment/cancel?appointment_id=${appointment._id.toString()}`,
      });

      res.status(200).json({ success: true, url: session.url });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Payment Success পেজ থেকে Stripe সেশন ভেরিফাই করা
  app.get("/payments/verify-session", async (req, res) => {
    try {
      const sessionId = req.query.session_id?.toString().trim();
      if (!sessionId) {
        return res
          .status(400)
          .json({ success: false, message: "Session ID missing." });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid") {
        return res
          .status(400)
          .json({ success: false, message: "Payment is not completed." });
      }

      const tx = await finalizeVerifiedPayment(session);
      if (!tx) {
        return res
          .status(404)
          .json({ success: false, message: "Appointment not found." });
      }

      res.status(200).json({
        success: true,
        message: "Payment verified successfully!",
        data: tx,
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
