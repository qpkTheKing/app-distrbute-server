const mongoose = require('mongoose');

const fileSchema = mongoose.Schema({
  hashId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  size: {
    type: Number,
    required: true,
  },
  fType: {
    type: String,
    required: true
  },
  appId: {
    type: String,
    required: true
  },
  forDownload: {
    type: String,
    required: true
  },
  created: {
    type: Date,
    default: Date.now()
  }
});

const File = mongoose.model("File", fileSchema);

module.exports = File;
