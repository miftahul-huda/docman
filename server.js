require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '800mb' }));
app.use(express.urlencoded({ limit: '800mb', extended: true }));
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/document_manager', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('MongoDB connected successfully');
});

// Session Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/document_manager' })
}));

// Passport Setup
const User = require('./models/User');

// ... (existing code)

// Passport Setup
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    // user is a plain object from GoogleStrategy return, so use _id
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        // Handle legacy session where id might be the full user object
        if (typeof id === 'object' && id !== null) {
            // If it's the old format, it might have profile.id (googleId)
            if (id.profile && id.profile.id) {
                const user = await User.findOne({ googleId: id.profile.id });
                if (user) return done(null, user);
            }
            // If we can't recover, return null (logs user out)
            return done(null, null);
        }

        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL || "http://localhost:3000/auth/google/callback",
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file']
},
    async function (accessToken, refreshToken, profile, cb) {
        try {
            let user = await User.findOne({ googleId: profile.id });

            if (user) {
                // Update refresh token if we got a new one
                if (refreshToken) {
                    user.refreshToken = refreshToken;
                    await user.save();
                }
            } else {
                // Create new user
                const newUser = {
                    googleId: profile.id,
                    email: profile.emails[0].value,
                    displayName: profile.displayName,
                    firstName: profile.name.givenName,
                    lastName: profile.name.familyName,
                    image: profile.photos[0].value,
                    refreshToken: refreshToken
                };
                user = await User.create(newUser);
            }

            // Pass the user object with the accessToken attached (for the session)
            // We don't save accessToken to DB as it expires quickly
            const userObj = user.toObject();
            userObj.accessToken = accessToken;
            // Ensure we have the refresh token in the session user object, either from args or DB
            userObj.refreshToken = refreshToken || user.refreshToken;

            return cb(null, userObj);
        } catch (err) {
            console.error('Error in Google Strategy:', err);
            return cb(err, null);
        }
    }
));

// Auth Routes
app.get('/auth/google', (req, res, next) => {
    const options = {
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
        accessType: 'offline',
        prompt: 'select_account' // Default to account selection
    };

    // If force param is present, force consent to get refresh token
    if (req.query.force) {
        options.prompt = 'consent select_account';
    }

    passport.authenticate('google', options)(req, res, next);
});

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    function (req, res) {
        // Check if we have a refresh token
        if (!req.user.refreshToken) {
            console.log('Missing refresh token, forcing consent...');
            // Logout to clear the partial session
            req.logout((err) => {
                if (err) console.error('Logout error during re-auth:', err);
                // Redirect to auth with forced consent
                res.redirect('/auth/google?force=true');
            });
            return;
        }

        // Successful authentication, redirect home.
        res.redirect('/');
    });

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            res.clearCookie('connect.sid');
            res.redirect('/login.html');
        });
    });
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        // req.user is now the User document (plus accessToken attached in strategy)
        res.json(req.user);
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
});

// Auth Middleware
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};

// Routes
const documentsRouter = require('./routes/documents');
app.use('/api/documents', ensureAuthenticated, documentsRouter);

// Serve Login Page for unauthenticated users accessing root
app.get('/', (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login.html');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
