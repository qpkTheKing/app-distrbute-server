const fs = require('fs');
const path = require('path');
const Axios = require('axios');
const ProgressBar = require('progress');

// 发送文件
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

// 选择指定的文件进行下载
const makeFile = async (fileHash, fileName, email) => {
  return new Promise((resolve, reject) => {

  });
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
      const { fileHash, fileName, email } = file;
      const { stream, totalSize } = await makeFile(fileHash, fileName, email);
      fn("APP-BEGIN-DELIVERY");
      await sendFile(stream, totalSize, "application/octet-stream", socket);
    });
  });
};

const socket = {
  transferServerSide
};

module.exports = socket;
