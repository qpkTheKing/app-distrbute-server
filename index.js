const express = require("express");
const PORT = process.env.PORT || 4000;
const morgan = require("morgan");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const config = require("./config/db.config");
const userRouter = require("./routes/user");
const app = express();
const http = require('http').createServer(app);
const socketAPI = require('./socket/transfer');

// IO Save in GLOBAL.
const socketIO = require('socket.io')(http);

//configure database and mongoose
mongoose.set("useCreateIndex", true);
mongoose
  .connect(config.database, {
    useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology:
      true
  })
  .then(() => {
    console.log("Database is connected");
  })
  .catch(err => {
    console.log({database_error: err});
  });

//registering cors
app.use(cors());
//configure body parser
app.use(bodyParser.urlencoded({limit: '800mb', extended: false}));
app.use(bodyParser.json({limit: '800mb'}));
//configure body-parser ends here
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
// routes
app.use(userRouter);

// start to socket listener
socketAPI.transferServerSide(socketIO);

http.listen(PORT, () => {
  console.log(`App is running on ${PORT}`);
});
