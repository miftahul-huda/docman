const express = require('express');
const router = express.Router();
const multer = require('multer');
const { google } = require('googleapis');
const Document = require('../models/Document');
const stream = require('stream');

// Configure Multer to use memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 800 * 1024 * 1024, // 800MB
        fieldSize: 50 * 1024 * 1024 // 50MB for metadata fields
    }
});

// Helper to get Drive Client
function getDriveClient(req) {
    console.log('Initializing Drive Client');
    console.log('User keys:', Object.keys(req.user));
    console.log('Has Refresh Token:', !!req.user.refreshToken);

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.CALLBACK_URL
    );
    oauth2Client.setCredentials({
        access_token: req.user.accessToken,
        refresh_token: req.user.refreshToken
    });
    return google.drive({ version: 'v3', auth: oauth2Client });
}

// Upload Multiple Documents
router.post('/upload', upload.array('files', 10), async (req, res) => {
    console.log('Upload request received');
    console.log('User:', req.user);
    console.log('Files:', req.files ? req.files.length : 0);

    try {
        const files = req.files;
        if (!files || files.length === 0) {
            console.log('No files in request');
            return res.status(400).json({ message: 'No files uploaded' });
        }

        // Check for refresh token
        if (!req.user.refreshToken) {
            console.log('User missing refresh token during upload');
            return res.status(401).json({
                message: 'Google Drive access expired. Please log in again.',
                code: 'MISSING_REFRESH_TOKEN'
            });
        }

        let metadata = {};
        try {
            // Expecting metadata to be a single object with title and note
            metadata = JSON.parse(req.body.metadata || '{}');
            console.log('Metadata:', metadata);
        } catch (e) {
            console.error('Error parsing metadata:', e);
        }

        console.log('Getting Drive client...');
        const drive = getDriveClient(req);
        const uploadedFiles = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`Uploading file ${i + 1}/${files.length}: ${file.originalname}`);

            const bufferStream = new stream.PassThrough();
            bufferStream.end(file.buffer);

            const driveResponse = await drive.files.create({
                requestBody: {
                    name: file.originalname,
                    mimeType: file.mimetype
                },
                media: {
                    mimeType: file.mimetype,
                    body: bufferStream
                },
                fields: 'id, webViewLink, webContentLink'
            });

            console.log(`File uploaded to Drive with ID: ${driveResponse.data.id}`);

            uploadedFiles.push({
                originalName: file.originalname,
                filename: file.originalname,
                driveFileId: driveResponse.data.id,
                webViewLink: driveResponse.data.webViewLink,
                webContentLink: driveResponse.data.webContentLink,
                size: file.size,
                mimetype: file.mimetype
            });
        }

        const newDoc = new Document({
            title: metadata.title || (files.length > 0 ? files[0].originalname : 'Untitled'),
            note: metadata.note || '',
            owner: req.user._id, // Assign owner
            files: uploadedFiles
        });

        const savedDoc = await newDoc.save();
        console.log(`Document saved to DB with ID: ${savedDoc._id}`);

        res.status(201).json([savedDoc]); // Return array to match previous API response structure roughly
    } catch (error) {
        console.error('Upload Error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ message: error.message });
    }
});

// Get All Documents with Pagination and Search
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (page - 1) * limit;

        // Build search filter
        let filter = { owner: req.user._id }; // Filter by owner
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { note: { $regex: search, $options: 'i' } },
                { 'files.originalName': { $regex: search, $options: 'i' } } // Search in filenames too
            ];
        }

        const totalDocuments = await Document.countDocuments(filter);
        const documents = await Document.find(filter)
            .sort({ uploadDate: -1 })
            .skip(skip)
            .limit(limit);

        const totalPages = Math.ceil(totalDocuments / limit);

        res.json({
            documents,
            pagination: {
                currentPage: page,
                totalPages,
                totalDocuments,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update Document Note & Title
router.put('/:id', async (req, res) => {
    try {
        const { title, note } = req.body;
        const updatedDoc = await Document.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id }, // Ensure ownership
            { title, note },
            { new: true }
        );

        if (!updatedDoc) {
            return res.status(404).json({ message: 'Document not found or unauthorized' });
        }

        res.json(updatedDoc);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete Document
router.delete('/:id', async (req, res) => {
    console.log(`Delete request for ID: ${req.params.id}`);
    try {
        const document = await Document.findOne({ _id: req.params.id, owner: req.user._id }); // Ensure ownership
        if (!document) {
            console.log('Document not found in DB or unauthorized');
            return res.status(404).json({ message: 'Document not found or unauthorized' });
        }

        // Delete all files from Drive
        if (document.files && document.files.length > 0) {
            const drive = getDriveClient(req);
            for (const file of document.files) {
                try {
                    console.log(`Attempting to delete Drive file: ${file.driveFileId}`);
                    await drive.files.delete({ fileId: file.driveFileId });
                    console.log('Drive file deleted successfully');
                } catch (driveError) {
                    console.error(`Error deleting file ${file.driveFileId} from Drive:`, driveError);
                    // Continue to delete others and DB entry
                }
            }
        }

        await Document.findByIdAndDelete(req.params.id);
        console.log('Document deleted from DB');
        res.json({ message: 'Document deleted' });
    } catch (error) {
        console.error('Delete Route Error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Download File
router.get('/download/:docId/:fileId', async (req, res) => {
    try {
        const document = await Document.findOne({ _id: req.params.docId, owner: req.user._id }); // Ensure ownership
        if (!document) {
            return res.status(404).json({ message: 'Document not found or unauthorized' });
        }

        const file = document.files.find(f => f._id.toString() === req.params.fileId);
        if (!file) {
            console.log('File not found in Document');
            return res.status(404).json({ message: 'File not found' });
        }

        console.log(`Attempting to download Drive file: ${file.driveFileId}`);
        const drive = getDriveClient(req);
        const result = await drive.files.get({
            fileId: file.driveFileId,
            alt: 'media'
        }, { responseType: 'stream' });

        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        res.setHeader('Content-Type', file.mimetype);

        result.data.pipe(res);
        console.log('Download stream started');

    } catch (error) {
        console.error('Download Error:', error);
        res.status(500).json({ message: 'Error downloading file' });
    }
});

module.exports = router;
