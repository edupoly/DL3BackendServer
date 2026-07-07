const express = require("express");
const fs = require("fs/promises");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const DB_PATH = path.join(__dirname, "db.json");

app.use(express.json());

const defaultDb = {
  users: [{ id: 1, email: "admin@example.com", password: "password123" }],
  products: [],
  cart: [],
};

async function readDb() {
  try {
    const contents = await fs.readFile(DB_PATH, "utf8");
    return { ...defaultDb, ...JSON.parse(contents) };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    await writeDb(defaultDb);
    return defaultDb;
  }
}

async function writeDb(db) {
  await fs.writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`);
}

function getNextId(items) {
  return (
    items.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1
  );
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token missing" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    req.user = user;
    next();
  });
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const db = await readDb();

  const user = db.users.find(
    (entry) => entry.email === email && entry.password === password,
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ email: user.email }, JWT_SECRET, {
    expiresIn: "1h",
  });

  res.json({
    message: "Login successful",
    token,
    user: { email: user.email },
  });
}));

app.get("/users", authenticateToken, asyncHandler(async (req, res) => {
  const db = await readDb();
  const users = db.users.map(({ password, ...user }) => user);

  res.json({
    message: "Users fetched successfully",
    users,
  });
}));

app.post("/users", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const db = await readDb();
  const existingUser = db.users.find((user) => user.email === email);

  if (existingUser) {
    return res.status(409).json({ error: "User already exists" });
  }

  const user = { id: getNextId(db.users), email, password };
  db.users.push(user);
  await writeDb(db);

  res.status(201).json({
    message: "User created successfully",
    user: { id: user.id, email: user.email },
  });
}));

app.get("/products", async (req, res) => {
  try {
    const db = await readDb();

    if (db.products.length > 0) {
      return res.json({
        message: "Products fetched successfully",
        products: db.products,
      });
    }

    const response = await fetch("https://dummyjson.com/products?limit=150");

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.status}`);
    }

    const data = await response.json();
    db.products = data.products || [];
    await writeDb(db);

    res.json({
      message: "Products fetched successfully",
      products: db.products,
    });
  } catch (error) {
    res.status(502).json({
      error: "Unable to fetch products",
      details: error.message,
    });
  }
});

app.post("/products", authenticateToken, asyncHandler(async (req, res) => {
  const product = req.body || {};

  if (!product.title) {
    return res.status(400).json({ error: "Product title is required" });
  }

  const db = await readDb();
  const newProduct = { id: getNextId(db.products), ...product };
  db.products.push(newProduct);
  await writeDb(db);

  res.status(201).json({
    message: "Product created successfully",
    product: newProduct,
  });
}));

app.patch("/products/:id", authenticateToken, asyncHandler(async (req, res) => {
  const db = await readDb();
  const product = db.products.find(
    (entry) => Number(entry.id) === Number(req.params.id),
  );

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  Object.assign(product, req.body, { id: product.id });

  db.cart = db.cart.map((item) => {
    if (Number(item.productId) !== Number(product.id)) {
      return item;
    }

    return { ...item, product };
  });

  await writeDb(db);

  res.json({
    message: "Product updated successfully",
    product,
  });
}));

app.delete("/products/:id", authenticateToken, asyncHandler(async (req, res) => {
  const db = await readDb();
  const productId = Number(req.params.id);
  const initialLength = db.products.length;

  db.products = db.products.filter((product) => Number(product.id) !== productId);

  if (db.products.length === initialLength) {
    return res.status(404).json({ error: "Product not found" });
  }

  db.cart = db.cart.filter((item) => Number(item.productId) !== productId);
  await writeDb(db);

  res.json({
    message: "Product removed successfully",
    products: db.products,
  });
}));

app.get("/cart", authenticateToken, asyncHandler(async (req, res) => {
  const db = await readDb();

  res.json({
    message: "Cart fetched successfully",
    cart: db.cart,
  });
}));

app.post("/cart", authenticateToken, asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body || {};

  if (!productId || quantity < 1) {
    return res.status(400).json({
      error: "Product id and a positive quantity are required",
    });
  }

  const db = await readDb();
  const product = db.products.find((entry) => Number(entry.id) === Number(productId));

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const existingItem = db.cart.find(
    (item) => Number(item.productId) === Number(productId),
  );

  if (existingItem) {
    existingItem.quantity += Number(quantity);
  } else {
    db.cart.push({
      id: getNextId(db.cart),
      productId: product.id,
      quantity: Number(quantity),
      product,
    });
  }

  await writeDb(db);

  res.status(201).json({
    message: "Cart updated successfully",
    cart: db.cart,
  });
}));

app.patch("/cart/:id", authenticateToken, asyncHandler(async (req, res) => {
  const { quantity } = req.body || {};

  if (!quantity || quantity < 1) {
    return res.status(400).json({ error: "A positive quantity is required" });
  }

  const db = await readDb();
  const item = db.cart.find((entry) => Number(entry.id) === Number(req.params.id));

  if (!item) {
    return res.status(404).json({ error: "Cart item not found" });
  }

  item.quantity = Number(quantity);
  await writeDb(db);

  res.json({
    message: "Cart item updated successfully",
    item,
  });
}));

app.delete("/cart/:id", authenticateToken, asyncHandler(async (req, res) => {
  const db = await readDb();
  const initialLength = db.cart.length;
  db.cart = db.cart.filter((item) => Number(item.id) !== Number(req.params.id));

  if (db.cart.length === initialLength) {
    return res.status(404).json({ error: "Cart item not found" });
  }

  await writeDb(db);

  res.json({
    message: "Cart item removed successfully",
    cart: db.cart,
  });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
