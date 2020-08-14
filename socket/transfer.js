const fs = require('fs')
const path = require('path');
const Axios = require('axios');
const ProgressBar = require('progress')

const FILE_SERVER = 'http://127.0.0.1:1080/files';

function sendFile(stream, totalSize, mimeType, socket) {
  if (mimeType != null && typeof mimeType !== 'string') {
    throw new Error('Invalid mimetype, expected string.')
  }
  return new Promise((resolve, reject) => {
    // const chunks = []
    let trunkNum = 1;
    stream
      .on('data', chunk => {
        socket.emit("APP-DELIVERY-TRUNK", {
          number: trunkNum++,
          size: chunk.length,
          totalSize,
          data: chunk
        }, data => {
          const { message, trunkNumber } = data;
          if (message === "APP-DELIVERY-TRUNK-SUCCESS") {
            // console.log(`${trunkNumber} Trunk received successful.`);
          }
        });
      })
      .on('end', () => {
        trunkNum = 0;
        socket.emit("APP-END-DELIVERY");
        resolve();
      })
      .on('error', () => {
        socket.emit("APP-END-DELIVERY-ERROR");
        reject();
      });
  })
}

const transfer = async (fileHash, fileName, type) => {
  const fileURL = `${FILE_SERVER}/${fileHash}`;

  const { data, headers } = await Axios({
    url: fileURL,
    method: 'GET',
    responseType: 'stream',
    maxContentLength: 2 * 100 * 1024,
    maxBodyLength: 2 * 100 * 1024,
  });

  const totalLength = headers['content-length'];

  const progressBar = new ProgressBar(`-> ${fileHash} downloading [:bar] :percent :etas`, {
    width: 40,
    complete: '=',
    incomplete: ' ',
    renderThrottle: 1,
    total: parseInt(totalLength)
  });

  const writer = fs.createWriteStream(
    path.resolve(process.cwd(), 'tmp', `${fileName}.${fileHash}.${type}`)
  );

  data.on('data', (chunk) => progressBar.tick(chunk.length));
  data.pipe(writer);

  return { stream: data, totalSize: totalLength };
};

const transferServerSide = socketIO => {
  // middleware to get parameters.
  socketIO.use((socket, next) => {
    let hash = socket.handshake.query.token;
    if (hash !== undefined && hash !== null) {
      return next();
    }
    return next(new Error('hash is required for download file.'));
  });
  socketIO.of('/files').on('connection', socket => {
    socket.on("APP-NEED-DELIVERY", async (file, fn) => {
      const { fileHash, fileName, type } = file;
      const { stream, totalSize } = await transfer(fileHash, fileName, type, socket);
      fn("APP-BEGIN-DELIVERY");
      await sendFile(stream, totalSize, "application/octet-stream", socket);
    });
  });
};

const socket = {
  transferServerSide
};

module.exports = socket;
