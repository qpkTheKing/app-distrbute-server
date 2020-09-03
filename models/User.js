const mongoose = require('mongoose');
const validator = require('validator').default;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

let userSchema = mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: value => {
      if (!validator.isEmail(value)) {
        throw new Error('Invalid Email address');
      }
    }
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minLength: 7
  },
  tokens: [{
    token: {
      type: String,
      required: true
    }
  }],
  apps: [{
    type: mongoose.Schema.ObjectId,
    ref: "App",
    require: false
  }],
  quota: {
    type: Number,
    required: false
  },
  role: {
    type: String,
    required: false
  },
  used: {
    type: Number,
    required: false
  },
  created: {
    type: Date,
    default: Date.now()
  }
});

userSchema.pre('save', async function (next) {
  // Hash the password before saving the user model
  const user = this;
  if (user.isModified('password')) {
    user.password = await bcrypt.hash(user.password, 8);
  }
  next();
})

userSchema.methods.generateAuthToken = async function () {
  // Generate an auth token for the user
  const JWT_KEY = 'WinterIsComingGOT2019';
  const user = this;
  const token = jwt.sign({ _id: user._id }, JWT_KEY);
  user.tokens = user.tokens.concat({ token });
  user.role = '0';
  await user.save();
  return token;
}

userSchema.statics.findByCredentials = async (email, password) => {
  // Search for a user by email and password.
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('Invalid login credentials');
  }
  const isPasswordMatch = await bcrypt.compare(password, user.password)
  if (!isPasswordMatch) {
    throw new Error('Invalid login credentials');
  }
  return user;
}

const User = mongoose.model("User", userSchema);

module.exports = User
