const express = require('express');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const app = express();
const PORT = 3000;

let users = []; // [{username, email, passwordHash, picture, logins:[]}]
let books = []; // [{title, filename, cover, author}]
let adViews = []; // {username, book, timestamp}

// File storage
const bookStorage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const profileStorage = multer.diskStorage({
  destination: './public/profiles/',
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadBook = multer({ storage: bookStorage });
const uploadProfile = multer({ storage: profileStorage });

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({secret:'secret',resave:false,saveUninitialized:true}));

// Auth helpers
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login.html');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.username !== 'admin') return res.send('Forbidden');
  next();
}

// Auth Routes
app.post('/signup', uploadProfile.single('picture'), async (req, res) => {
  const { username, email, password } = req.body;
  if (users.find(u => u.username === username || u.email === email)) return res.send('User exists');
  const passwordHash = await bcrypt.hash(password, 10);
  const picture = req.file ? req.file.filename : '';
  users.push({ username, email, passwordHash, picture, logins: [] });
  res.redirect('/login.html');
});
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user) return res.send('No user');
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.send('Wrong password');
  req.session.user = { username: user.username, picture: user.picture };
  user.logins = user.logins || [];
  user.logins.push(new Date());
  res.redirect('/');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login.html'); });

// Profile
app.get('/api/profile', requireLogin, (req, res) => {
  const user = users.find(u => u.username === req.session.user.username);
  if (!user) return res.status(404).send();
  res.json({ username: user.username, email: user.email, picture: user.picture });
});

// Book Management
app.post('/upload', requireAdmin, uploadBook.fields([{name:'book'},{name:'cover'}]), (req, res) => {
  const { title, author } = req.body;
  const bookFile = req.files['book'] ? req.files['book'][0].filename : '';
  const coverFile = req.files['cover'] ? req.files['cover'][0].filename : '';
  books.push({ title, filename: bookFile, cover: coverFile, author });
  res.redirect('/admin.html');
});
app.get('/api/books', requireLogin, (req, res) => res.json(books));
app.get('/download/:filename', requireLogin, (req, res) => {
  res.download(path.join(__dirname, 'public/uploads', req.params.filename));
});

// Ad view tracking
app.post('/ad-view', requireLogin, (req, res) => {
  adViews.push({
    username: req.session.user.username,
    book: req.body.book,
    timestamp: new Date()
  });
  res.sendStatus(200);
});

// Admin
app.get('/admin/users', requireAdmin, (req, res) => {
  res.json(users.map(u => ({
    username: u.username, email: u.email, picture: u.picture, logins: u.logins
  })));
});
app.post('/admin/delete-user', requireAdmin, (req, res) => {
  users = users.filter(u => u.username !== req.body.username);
  res.sendStatus(200);
});
app.get('/admin/monetization', requireAdmin, (req, res) => res.json(adViews));
app.get('/admin/monetization/csv', requireAdmin, (req, res) => {
  let csv = "username,book,timestamp\n" +
    adViews.map(v => `${v.username},${v.book},${v.timestamp}`).join('\n');
  res.attachment('ad_views.csv').send(csv);
});

app.listen(PORT, () => console.log(`Server at http://localhost:${PORT}`));