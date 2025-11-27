const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    default: ''
  },
  originalName: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  driveFileId: {
    type: String,
    required: true
  },
  webViewLink: String,
  webContentLink: String,
  size: {
    type: Number,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  note: {
    type: String,
    default: ''
  },
  uploadDate: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Document', documentSchema);
