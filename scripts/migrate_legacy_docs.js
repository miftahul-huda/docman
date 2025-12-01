require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/docman';

async function migrate() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const collection = mongoose.connection.db.collection('documents');
        const cursor = collection.find({});

        let count = 0;
        let migrated = 0;

        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            count++;

            // Check if it's a legacy document (has driveFileId at root and no files array or empty files array)
            if (doc.driveFileId && (!doc.files || doc.files.length === 0)) {
                console.log(`Migrating document: ${doc._id} - ${doc.title || doc.originalName}`);

                const fileData = {
                    originalName: doc.originalName,
                    filename: doc.filename || doc.originalName,
                    driveFileId: doc.driveFileId,
                    webViewLink: doc.webViewLink,
                    webContentLink: doc.webContentLink,
                    size: doc.size,
                    mimetype: doc.mimetype,
                    _id: new mongoose.Types.ObjectId() // Generate a new ID for the file subdocument
                };

                await collection.updateOne(
                    { _id: doc._id },
                    {
                        $set: { files: [fileData] },
                        $unset: {
                            originalName: "",
                            filename: "",
                            driveFileId: "",
                            webViewLink: "",
                            webContentLink: "",
                            size: "",
                            mimetype: ""
                        }
                    }
                );
                migrated++;
            }
        }

        console.log(`Migration complete. Scanned ${count} documents. Migrated ${migrated} documents.`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

migrate();
