require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pharmacy_db",
  waitForConnections: true,
  connectionLimit: 10
});

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Please log in." });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ message: "Invalid or expired login." }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required." });
  next();
}

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email and password are required." });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      "INSERT INTO users (name,email,password,phone) VALUES (?,?,?,?)",
      [name, email.toLowerCase(), hash, phone || null]
    );
    res.status(201).json({ message: "Registration successful.", userId: result.insertId });
  } catch (e) {
    res.status(400).json({ message: e.code === "ER_DUP_ENTRY" ? "Email already registered." : "Could not register." });
  }
});

app.post("/api/login", async (req, res) => {
  const [rows] = await pool.execute("SELECT * FROM users WHERE email=?", [(req.body.email || "").toLowerCase()]);
  if (!rows.length || !(await bcrypt.compare(req.body.password || "", rows[0].password)))
    return res.status(401).json({ message: "Incorrect email or password." });
  const u = rows[0];
  const token = jwt.sign({ userId: u.user_id, name: u.name, role: u.role }, process.env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, user: { userId: u.user_id, name: u.name, role: u.role } });
});

app.get("/api/medicines", async (req, res) => {
  const q = `%${req.query.search || ""}%`;
  const [rows] = await pool.execute(
    "SELECT medicine_id,medicine_name,category,manufacturer,price,stock,expiry_date FROM medicines WHERE medicine_name LIKE ? OR category LIKE ? ORDER BY medicine_name",
    [q, q]
  );
  res.json(rows);
});

app.post("/api/medicines", auth, adminOnly, async (req, res) => {
  const { medicine_name, category, manufacturer, price, stock, expiry_date } = req.body;
  if (!medicine_name || !category || price == null || stock == null || !expiry_date)
    return res.status(400).json({ message: "Please fill all required medicine fields." });
  const [r] = await pool.execute(
    "INSERT INTO medicines (medicine_name,category,manufacturer,price,stock,expiry_date) VALUES (?,?,?,?,?,?)",
    [medicine_name, category, manufacturer || null, price, stock, expiry_date]
  );
  res.status(201).json({ message: "Medicine added.", medicineId: r.insertId });
});

app.put("/api/medicines/:id", auth, adminOnly, async (req, res) => {
  const { medicine_name, category, manufacturer, price, stock, expiry_date } = req.body;
  await pool.execute(
    "UPDATE medicines SET medicine_name=?,category=?,manufacturer=?,price=?,stock=?,expiry_date=? WHERE medicine_id=?",
    [medicine_name, category, manufacturer || null, price, stock, expiry_date, req.params.id]
  );
  res.json({ message: "Medicine updated." });
});

app.delete("/api/medicines/:id", auth, adminOnly, async (req, res) => {
  try {
    await pool.execute("DELETE FROM medicines WHERE medicine_id=?", [req.params.id]);
    res.json({ message: "Medicine deleted." });
  } catch { res.status(409).json({ message: "This medicine is used in an order and cannot be deleted." }); }
});

app.post("/api/orders", auth, async (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: "Your cart is empty." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let total = 0;
    const checked = [];
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Invalid quantity.");
      const [rows] = await conn.execute("SELECT * FROM medicines WHERE medicine_id=? FOR UPDATE", [item.medicine_id]);
      if (!rows.length || rows[0].stock < qty) throw new Error("Medicine unavailable or insufficient stock.");
      if (new Date(rows[0].expiry_date) < new Date(new Date().toDateString())) throw new Error("An expired medicine cannot be ordered.");
      const price = Number(rows[0].price);
      total += price * qty;
      checked.push({ id: rows[0].medicine_id, qty, price });
    }
    const [order] = await conn.execute(
      "INSERT INTO orders (user_id,order_date,total_amount) VALUES (?,CURDATE(),?)",
      [req.user.userId, total]
    );
    for (const item of checked) {
      await conn.execute("INSERT INTO order_items (order_id,medicine_id,quantity,unit_price) VALUES (?,?,?,?)",
        [order.insertId, item.id, item.qty, item.price]);
      await conn.execute("UPDATE medicines SET stock=stock-? WHERE medicine_id=?", [item.qty, item.id]);
    }
    await conn.commit();
    res.status(201).json({ message: "Order placed successfully.", orderId: order.insertId, totalAmount: total });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ message: e.message || "Order could not be placed." });
  } finally { conn.release(); }
});

app.get("/api/orders", auth, async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const sql = `SELECT o.order_id,o.user_id,u.name,o.order_date,o.total_amount,o.status
    FROM orders o JOIN users u ON u.user_id=o.user_id
    ${isAdmin ? "" : "WHERE o.user_id=?"} ORDER BY o.order_id DESC`;
  const [rows] = await pool.execute(sql, isAdmin ? [] : [req.user.userId]);
  res.json(rows);
});

app.get("/api/admin/stock-alerts", auth, adminOnly, async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT medicine_id,medicine_name,stock,expiry_date FROM medicines WHERE stock<=10 OR expiry_date<=DATE_ADD(CURDATE(), INTERVAL 60 DAY) ORDER BY expiry_date"
  );
  res.json(rows);
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Pharmacy app running at http://localhost:${port}`));