const fs = require("fs");
const clone = require("clone");
const data = require("./db.json");
// import jsonServer from "json-server";
const jsonServer = require("json-server");

// import  jwt from "jsonwebtoken";
const jwt = require("jsonwebtoken");

const isProductionEnv = process.env.NODE_ENV === "production";

// import fetch from "node-fetch";
// import bodyParser from "json-server/lib/server/body-parser";
const bodyParser = require("body-parser");
const server = jsonServer.create();
// const router = jsonServer.router("database.json");
// For mocking the POST request, POST request won't make any changes to the DB in production environment
const router = jsonServer.router(
  isProductionEnv ? clone(data) : "database.json",
  {
    _isFake: isProductionEnv
  }
);

server.use(bodyParser.urlencoded({ extended: true }));
server.use(bodyParser.json());
server.use(jsonServer.defaults());

const SECRET_KEY = "123456789";

// token timeout is set here
const expiresIn = "1m";

// Create a token from a payload
function createToken(payload) {
  return jwt.sign(payload, SECRET_KEY, { expiresIn });
}

// Verify the token
function verifyToken(token) {
  return jwt.verify(token, SECRET_KEY, (err, decode) => {
    if (err) {
      throw Error(err);
    } else {
      return decode;
    }
  });
}

// Check if the user exists in database
function isAuthenticated({ email, password }) {
  return (
    //userdb.users.findIndex(user => user.username === username && user.password === password) !== -1
    router.db
      .get("users")
      .findIndex((user) => user.email === email && user.password === password)
      .value() !== -1
  );
}

// convert fetch response to json if it is OK
function convertToJson(res) {
  if (res.ok) {
    return res.json();
  } else {
    console.log(res.statusText);
    throw new Error(res.statusText);
  }
}

server.post("/login", (req, res) => {
  const { email, password } = req.body;
  console.log(email, password);
  if (isAuthenticated({ email, password }) === false) {
    const status = 401;
    const message = "Incorrect username or password";
    res.status(status).json({ status, message });
    return;
  }
  const accessToken = createToken({ email, password });
  res.status(200).json({ accessToken });
});

const apiKey = "/?api_key=6ff8b372bdd0ca37da830f278129a7bf";
const baseUrl = "http://api.sierratradingpost.com/api/1.0/";

// server.post('/proxy',(req,res) => {

//   const { url } = req.body;
//   console.log(url);
//   fetch(url+apiKey).then(convertToJson).then((data) => {
//     res.status(200).json(data);
//   })

// });

server.get("/product/:id", async (req, res) => {
  const id = req.params.id;
  // fetch(baseUrl+'product/'+id+apiKey)
  // .then(convertToJson)
  // .then((data) => {
  //   res.status(200).json(data);
  // }).catch((err) => res.status(401).json(err));
  const products = await router.db.get("products");
  const product = await products.find((product) => product.Id == id);
  console.log(products);
  if (product) {
    res.status(200).json({ Result: product });
  } else {
    res.status(400).json({ Result: "No Product found" });
  }
});
server.get("/products/search/:query", (req, res) => {
  const query = req.params.query;
  // console.log(baseUrl+'products/search~'+query+apiKey);
  // fetch(baseUrl+'products/search~'+query+apiKey)
  // .then(convertToJson)
  // .then((data) => {
  //   res.status(200).json(data);
  // })
  // .catch((err) => res.status(400).json(err));
  const products = router.db.get("products");
  const filtered = products.filter((product) => product.Category == query);
  // const lastOrder = Math.max(...products.map(o=>o.id));
  // order.id = lastOrder+1;
  // products.push(order).write();
  if (filtered) {
    res.status(200).json({ Result: filtered });
  } else {
    res.status(200).json({ Result: "No products found" });
  }
});

// checkout
server.post("/checkout", (req, res) => {
  const order = req.body;
  let error = false;
  let errorMsg = {};
  // console.log(order);
  // check for required fields
  if (!order.orderDate) {
    error = true;
    errorMsg.orderDate = "No Order Date";
  }
  if (!order.fname) {
    error = true;
    errorMsg.fname = "No First Name";
  }
  if (!order.lname) {
    error = true;
    errorMsg.lname = "No Last Name";
  }
  if (!order.street || !order.city || !order.state || !order.zip) {
    error = true;
    errorMsg.address = "Missing or incomplete address";
  }
  if (!order.cardNumber) {
    error = true;
    errorMsg.cardNumber = "No card number";
  } else if (order.cardNumber !== "1234123412341234") {
    // check for valid number
    error = true;
    errorMsg.cardNumber = "Invalid Card Number";
  }
  if (!order.expiration) {
    error = true;
    errorMsg.expiration = "Missing card expiration";
  } else {
    const parts = order.expiration.split("/");
    console.log(parts);
    if (parts[0] > 0 && parts[0] <= 12 && parts[1]) {
      const expireDate = new Date(
        parseInt("20" + parts[1]),
        parseInt(parts[0]) - 1,
        1
      );
      const curDate = new Date();

      if (expireDate < curDate) {
        error = true;
        errorMsg.expiration = "Card expired";
      }
    } else {
      error = true;
      errorMsg.expiration = "Invalid expiration date";
    }
  }
  if (error) {
    res.status(400).json(errorMsg);
  } else {
    const orders = router.db.get("orders");
    const lastOrder = Math.max(...orders.map((o) => o.id));
    order.id = lastOrder + 1;
    orders.push(order).write();
    res.status(200).json({ orderId: order.id, message: "Order Placed" });
  }
});

server.use((req, res, next) => {
  if (req.method === "POST") {
    const { authorization } = req.headers;
    if (authorization) {
      const [scheme, token] = authorization.split(" ");
      //jwt.verify(token, 'json-server-auth-123456');
      // Add claims to request
      req.claims = verifyToken(token);
      req.body.userId = req.claims.email;
    }
    req.body.createdAt = Date.now();
  }
  // Continue to JSON Server router
  next();
});
server.use(/^(?!\/auth).*$/, (req, res, next) => {
  if (
    req.headers.authorization === undefined ||
    req.headers.authorization.split(" ")[0] !== "Bearer"
  ) {
    const status = 401;
    const message = "Error in authorization format";
    res.status(status).json({ status, message });
    return;
  }
  try {
    console.log("checking token");
    verifyToken(req.headers.authorization.split(" ")[1]);

    next();
  } catch (err) {
    const status = 401;
    const message = err.message;
    res.status(status).json({ status, message });
  }
});
server.use((req, res, next) => {
  if (req.path !== "/") router.db.setState(clone(data));
  next();
});
server.use(router);

server.listen(3000, () => {
  console.log("Run Auth API Server on port 3000");
});

module.exports = server;
