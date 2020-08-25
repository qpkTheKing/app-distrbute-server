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
  downloadTimes: {
    type: String,
    required: false
  },
  downloadUrl: {
    type: String,
    required: false
  },
  version: {
    type: String,
    required: false,
    minLength: 7
  },
  description: {
    type: String,
    required: false
  },
  applicationId: {
    type: String,
    required: false
  },
  versionCode: {
    type: String,
    required: false
  },
  sha1: {
    type: String,
    require: false
  },
  icon: {
    type: String,
    required: false
  },
  created: {
    type: Date,
    default: Date.now()
  }
});

const File = mongoose.model("File", fileSchema);

module.exports = File;
