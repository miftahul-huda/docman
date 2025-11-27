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

        let metadata = [];
        try {
            metadata = JSON.parse(req.body.metadata || '[]');
            console.log('Metadata:', metadata);
        } catch (e) {
            console.error('Error parsing metadata:', e);
        }

        console.log('Getting Drive client...');
        const drive = getDriveClient(req);
        const savedDocuments = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const meta = metadata[i] || {};

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

            const newDoc = new Document({
                title: meta.title || file.originalname,
                note: meta.note || '',
                originalName: file.originalname,
                filename: file.originalname, // Keep original name as filename
                driveFileId: driveResponse.data.id,
                webViewLink: driveResponse.data.webViewLink,
                webContentLink: driveResponse.data.webContentLink,
                size: file.size,
                mimetype: file.mimetype
            });
            const savedDoc = await newDoc.save();
            console.log(`Document saved to DB with ID: ${savedDoc._id}`);
            savedDocuments.push(savedDoc);
        }

        console.log(`Upload complete. ${savedDocuments.length} documents saved.`);
        res.status(201).json(savedDocuments);
    } catch (error) {
        console.error('Upload Error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ message: error.message });
    }
});

// Get All Documents with Pagination and Search
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        // Build search filter
        let filter = {};
        if (search) {
            filter = {
                $or: [
                    { title: { $regex: search, $options: 'i' } },
                    { note: { $regex: search, $options: 'i' } }
                ]
            };
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
        const { note, title } = req.body;
        const updateData = {};
        if (note !== undefined) updateData.note = note;
        if (title !== undefined) updateData.title = title;

        const document = await Document.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }
        res.json(document);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete Document
router.delete('/:id', async (req, res) => {
    console.log(`Delete request for ID: ${req.params.id}`);
    try {
        const document = await Document.findById(req.params.id);
        if (!document) {
            console.log('Document not found in DB');
            return res.status(404).json({ message: 'Document not found' });
        }

        // Delete from Drive
        try {
            console.log(`Attempting to delete Drive file: ${document.driveFileId}`);
            const drive = getDriveClient(req);
            await drive.files.delete({ fileId: document.driveFileId });
            console.log('Drive file deleted successfully');
        } catch (driveError) {
            console.error('Error deleting from Drive:', driveError);
            // Continue to delete from DB even if Drive fails (or file already gone)
        }

        await Document.findByIdAndDelete(req.params.id);
        console.log('Document deleted from DB');
        res.json({ message: 'Document deleted' });
    } catch (error) {
        console.error('Delete Route Error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Download Document (Proxy or Redirect)
router.get('/download/:id', async (req, res) => {
    console.log(`Download request for ID: ${req.params.id}`);
    try {
        const document = await Document.findById(req.params.id);
        if (!document) {
            console.log('Document not found in DB');
            return res.status(404).json({ message: 'Document not found' });
        }

        // Redirect to Drive Web Content Link (easiest for now)
        // Or stream it if we want to hide the Drive URL
        // Let's stream it to keep the experience consistent
        console.log(`Attempting to download Drive file: ${document.driveFileId}`);
        const drive = getDriveClient(req);
        const result = await drive.files.get({
            fileId: document.driveFileId,
            alt: 'media'
        }, { responseType: 'stream' });

        res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
        res.setHeader('Content-Type', document.mimetype);

        result.data.pipe(res);
        console.log('Download stream started');

    } catch (error) {
        console.error('Download Error:', error);
        res.status(500).json({ message: 'Error downloading file' });
    }
});

module.exports = router;
