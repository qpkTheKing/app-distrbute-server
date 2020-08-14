const mongoose = require('mongoose');

let appSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  appId: {
    type: String,
    required: true,
    unique: true
  },
  size: {
    type: String,
    require: false
  },
  version: {
    type: String,
    required: false,
    minLength: 7
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
  files: [{
    type: mongoose.Schema.ObjectId,
    ref: "File",
    require: false
  }],
  created: {
    type: Date,
    default: Date.now()
  }
});

const App = mongoose.model("App", appSchema);

module.exports = App;
