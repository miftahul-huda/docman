const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    googleId: {
        type: String,
        required: true,
        unique: true
    },
    email: String,
    displayName: String,
    firstName: String,
    lastName: String,
    image: String,
    refreshToken: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);
