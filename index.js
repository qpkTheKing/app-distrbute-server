const express = require("express");
const path = require("path");
const PORT = process.env.PORT || 4000;
const morgan = require("morgan");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const config = require("./config/db.config");
const userRouter = require("./routes/user");
const tus = require('tus-node-server');
const EVENTS = require('tus-node-server').EVENTS;
const serveStatic = require('serve-static');
const contentDisposition = require('content-disposition');
// const socketAPI = require('./socket/transfer');

const app = express();
const http = require('http').createServer(app);

// static for mobileconfig
const mobileConfigs = path.resolve(process.cwd(), 'uploader', 'mobileConfigs');
// static for apk
const apkFiles = path.resolve(process.cwd(), 'uploader', 'data');
// static for sale
const saleFiles = path.resolve(process.cwd(), 'tmp');
const setHeaders = (res, path) => {
  res.setHeader('Content-Disposition', contentDisposition(path));
  res.setHeader('Cache-Control', 'public, max-age=0');
  res.setHeader('Content-type', 'application/x-apple-aspen-config; charset=utf-8');
};
const setAPKHeaders = (res, path) => {
  res.setHeader('Content-Disposition', contentDisposition(path));
  res.setHeader('Cache-Control', 'public, max-age=0');
  res.setHeader('Content-type', 'application/octet-stream');
};
const setJPGHeaders = (res, path) => {
  res.setHeader('Content-Disposition', contentDisposition(path));
  res.setHeader('Cache-Control', 'public, max-age=0');
  res.setHeader('Content-type', 'image/jpeg');
};
const serve = serveStatic(mobileConfigs, {
  'index': false,
  'setHeaders': setHeaders
});
const apkServer = serveStatic(apkFiles, {
  'index': false,
  'setHeaders': setAPKHeaders
});
const saleServer = serveStatic(saleFiles, {
  'index': false,
  'setHeaders': setJPGHeaders
});
app.use(serve);
app.use(apkServer);
app.use(saleServer);

// TUS
const uploadApp = express();
const server = new tus.Server();
server.datastore = new tus.FileStore({
  path: '/files'
});
server.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
  console.log(`Upload complete for file ${event.file.id}`);
});
server.on(EVENTS.EVENT_ENDPOINT_CREATED, (event) => {
  console.log(`Upload complete for file ${event.url}`);
});
uploadApp.all('*', server.handle.bind(server));
app.use('/uploads', uploadApp);


// IO Save in GLOBAL.
// const socketIO = require('socket.io')(http);

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
    console.log({ database_error: err });
  });

//registering cors
app.use(cors());
//configure body parser
app.use(bodyParser.urlencoded({ limit: '800mb', extended: false }));
app.use(bodyParser.json({ limit: '800mb' }));
//configure body-parser ends here
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
// routes
app.use(userRouter);

// start to socket listener
// socketAPI.transferServerSide(socketIO);

http.listen(PORT, () => {
  console.log(`App is running on ${PORT}`);
});
