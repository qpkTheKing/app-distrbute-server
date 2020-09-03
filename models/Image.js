const mongoose = require('mongoose');

const ImageFileSchema = mongoose.Schema({
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
  description: {
    type: String,
    required: false
  },
  updated: {
    type: Date,
    default: Date.now()
  },
  created: {
    type: Date,
    default: Date.now()
  }
});

const Image = mongoose.model("Image", ImageFileSchema);

module.exports = Image;
