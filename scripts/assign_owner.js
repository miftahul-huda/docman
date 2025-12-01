require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('../models/Document');
const User = require('../models/User');

async function migrateDocuments() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Find the user by email
        const userEmail = 'miftahul.huda.idn@gmail.com';
        const user = await User.findOne({ email: userEmail });

        if (!user) {
            console.error(`User with email ${userEmail} not found!`);
            console.log('Please make sure you have logged in at least once.');
            process.exit(1);
        }

        console.log(`Found user: ${user.displayName} (${user.email})`);
        console.log(`User ID: ${user._id}`);

        // Find documents without owner
        const documentsWithoutOwner = await Document.find({
            $or: [
                { owner: { $exists: false } },
                { owner: null }
            ]
        });

        console.log(`Found ${documentsWithoutOwner.length} documents without owner`);

        if (documentsWithoutOwner.length === 0) {
            console.log('No documents to migrate. All documents already have an owner.');
            process.exit(0);
        }

        // Update all documents to have this user as owner
        const result = await Document.updateMany(
            {
                $or: [
                    { owner: { $exists: false } },
                    { owner: null }
                ]
            },
            { $set: { owner: user._id } }
        );

        console.log(`Successfully updated ${result.modifiedCount} documents`);
        console.log('Migration complete!');

        process.exit(0);
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

migrateDocuments();
