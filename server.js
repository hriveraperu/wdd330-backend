const fs = require('fs');
const jsonServer = require('json-server');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const server = jsonServer.create();
const router = jsonServer.router('./database.json');

server.use(bodyParser.urlencoded({ extended: true }));
server.use(bodyParser.json());
server.use(jsonServer.defaults());

const SECRET_KEY = '123456789';

// token timeout is set here
const expiresIn = '1m';

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
      .get('users')
      .findIndex(user => user.email === email && user.password === password)
      .value() !== -1
  );
}

// convert fetch response to json if it is OK
function convertToJson(res) {
  if (res.ok) {
    return res.json();
  } else {
    throw new Error('Bad Response');
  }
}

server.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (isAuthenticated({ email, password }) === false) {
    const status = 401;
    const message = 'Incorrect username or password';
    res.status(status).json({ status, message });
    return;
  }
  const accessToken = createToken({ email, password });
  res.status(200).json({ accessToken });
});

const apiKey = "/?api_key=6ff8b372bdd0ca37da830f278129a7bf";
const baseUrl = "http://api.sierratradingpost.com/api/1.0/";

server.post('/proxy',(req,res) => {
  
  const { url } = req.body;
  console.log(url);
  fetch(url+apiKey).then(convertToJson).then((data) => {
    res.status(200).json(data);
  })

});

server.get('/product/:id',(req,res) => {
  const id = req.params.id;
  fetch(baseUrl+'product/'+id+apiKey)
  .then(convertToJson)
  .then((data) => {
    res.status(200).json(data);
  }).catch((err) => res.status(401).json(err));

});
server.get('/products/search/:query',(req,res) => {
  const query = req.params.query;
  fetch(baseUrl+'products/search~'+query+apiKey)
  .then(convertToJson)
  .then((data) => {
    res.status(200).json(data);
  })
  .catch((err) => res.status(401).json(err));

});

// checkout
server.post('/checkout',(req,res) => {
  const { order } = req.body;

  res.status(200).json("Working"); 
 });

server.use((req, res, next) => {
  if (req.method === 'POST') {
    const { authorization } = req.headers;
    if (authorization) {
      const [scheme, token] = authorization.split(' ');
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
    req.headers.authorization.split(' ')[0] !== 'Bearer'
  ) {
    const status = 401;
    const message = 'Error in authorization format';
    res.status(status).json({ status, message });
    return;
  }
  try {
    console.log('checking token');
    verifyToken(req.headers.authorization.split(' ')[1]);

    next();
  } catch (err) {
    const status = 401;
    const message = err.message;
    res.status(status).json({ status, message });
  }
});

server.use(router);

server.listen(3000, () => {
  console.log('Run Auth API Server on port 3000');
});
