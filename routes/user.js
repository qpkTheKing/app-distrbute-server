const express = require('express');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const User = require('../models/User');
const File = require('../models/File');
const App = require('../models/App');
const {v4: uuidv4} = require('uuid');
const PkgReader = require('reiko-parser');

const router = express.Router();

// 创建用户
router.post('/user/register', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    const token = await user.generateAuthToken();
    res.status(201).send({token});
  } catch (error) {
    res.status(400).send(error);
  }
});

// 登陆
router.post('/user/login', async (req, res) => {
  try {
    const {email, password} = req.body;
    const user = await User.findByCredentials(email, password);
    if (!user) {
      return res.status(401).send({error: 'Login failed! Check authentication credentials'});
    }
    const token = await user.generateAuthToken();
    res.send({token});
  } catch (error) {
    res.status(400).send(error);
  }
});

// 查询个人信息
router.get('/user/me', auth, async (req, res) => {
  const {email} = req.user;
  const result = await User.find({email});
  const {name, quota, created} = result[0];
  res.send({code: 200, message: '', data: {name, email, quota, created}});
});

// 创建新的APP
router.post('/user/app', auth, async (req, resp) => {
  try {
    const {name} = req.body;
    const user = req.user;
    const uuid = uuidv4().split('-').join('');

    const newApp = new App({name, appId: uuid, owner: user.email});
    await newApp.save();

    await User.update({email: user.email}, {$addToSet: {apps: [newApp._id]}});

    resp.send({code: 200, message: 'DONE'});
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 查询用户APP
router.get('/user/app', auth, async (req, resp) => {
  const {email} = req.user;
  const {appId} = req.query;
  let resultApp;

  try {
    const userWithApps = await User.aggregate([
      {
        $match: {email}
      },
      {
        $lookup: {
          from: 'apps',
          localField: 'apps',
          foreignField: '_id',
          as: 'ownerdApps'
        }
      }
    ]);

    if (appId) {
      resultApp = userWithApps[0]['ownerdApps'].filter(app => {
        return app.appId === appId;
      });
    } else {
      resultApp = userWithApps[0]['ownerdApps'];
    }

    resp.send({code: 200, data: resultApp, message: ''});
  } catch (error) {
    console.log(error);
    resp.status(400).send(error);
  }
});

// 客户端上传包后用来获取APP的包文件上下文信息
router.get('/user/app/pkg', auth, async (req, resp) => {
  const {pkgHashId, pkgFileName} = req.query;
  const finalPkgPath = path.resolve(process.cwd(), 'uploader', 'pkgs', `${pkgHashId}-${pkgFileName}`);
  const uploadedFilePath = path.resolve(process.cwd(), 'uploader', 'data', pkgHashId);

  try {
    fs.copyFileSync(uploadedFilePath, finalPkgPath);

    const fileState = fs.statSync(uploadedFilePath);
    const reader = new PkgReader(finalPkgPath, 'apk', {withIcon: true});

    reader.parse(async (err, pkgInfo) => {
      if (err) {
        resp.status(400).send(err);
      } else {
        const {
          versionCode,
          versionName,
          package,
          icon
        } = pkgInfo;

        resp.send({
          code: 200, message: '', data: {
            size: fileState.size,
            version: versionName,
            applicationId: package,
            versionCode: versionCode,
            sha1: 'NOT_SET',
            'icon': icon
          }
        });
      }
    });
  } catch (error) {
    console.log(error);
    resp.status(400).send(error);
  }
});

// 客户端上传文件后添加对应的数据库条目
router.post('/user/app/file', auth, async (req, resp) => {
  try {
    const {email} = req.user;
    const {hashId, size, fileName, type, appId, forDownload, downloadUrl, appDescription, pkgMeta, fileDbId} = req.body;

    async function hasExistsFile() {
      const userWithApps = await User.aggregate([
        {
          $match: {email}
        },
        {
          $lookup: {
            from: 'apps',
            localField: 'apps',
            foreignField: '_id',
            as: 'ownerdApps'
          }
        }
      ]);
      const app = userWithApps[0]['ownerdApps'].filter(app => {
        return app.appId === appId;
      })[0];
      const existsFile = app.files.filter(file => {
        return file.toString() === fileDbId.toString()
      });

      return existsFile && existsFile.length > 0;
    }

    // 如果没有hashId，表面没有上传过文件，只需更新文件的描述和截图等信息.
    if (hashId) {
      const {
        version,
        applicationId,
        versionCode,
        sha1,
        icon
      } = pkgMeta;

      if (appId) {
        const {files} = await App.findOne({appId});
        if (files.length === 0) {
          await App.update({appId}, {
            $set: {
              appDescription,
              version,
              applicationId,
              versionCode,
              sha1,
              icon
            }
          });
        }
      }
      if (fileDbId) {
        if (await hasExistsFile()) {
          await File.updateOne({_id: fileDbId}, {
            $set: {
              name: fileName,
              description: appDescription,
              downloadUrl,
              forDownload,
              fType: type,
              size,
              hashId,
              version,
              applicationId,
              versionCode,
              sha1,
              icon
            }
          });
        }
      } else {
        const newFile = new File({
          hashId,
          appId,
          name: fileName,
          size,
          fType: type,
          forDownload,
          downloadTimes: "0",
          description: appDescription,
          downloadUrl,
          version,
          applicationId,
          versionCode,
          sha1,
          icon
        });
        await newFile.save();
        await App.update({appId}, {$addToSet: {files: [newFile._id]}});
      }
    } else {
      if (fileDbId) {
        if (await hasExistsFile()) {
          await File.updateOne({_id: fileDbId}, {
            $set: {
              description: appDescription,
              forDownload: forDownload,
              fType: type,
            }
          });
        }
      }
    }

    resp.send({code: 200, message: 'DONE', data: []});
  } catch (error) {
    console.log(error);
    resp.status(400).send(error);
  }
});

// 查询指定品牌下的文件
router.get('/user/app/files', auth, async (req, resp) => {
  const {email} = req.user;
  const {appId} = req.query;

  try {
    const result = await User.find({email}).populate({
      path: "apps",
      populate: {path: "files"}
    }).exec();

    const ownerdApps = result[0]['apps'].filter(app => {
      return app.appId === appId;
    });

    resp.send({code: 200, message: '', data: ownerdApps[0]['files']});
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 查询指定文件的信息
router.get('/user/app/file', auth, async (req, resp) => {
  const {fileId} = req.query;
  try {
    const file = await File.findOne({_id: fileId});
    resp.send({code: 200, message: '', data: file});
  } catch (error) {
    console.log(error);
    resp.status(400).send(error);
  }
});

// 更新指定品牌下的文件
router.put('/user/app/file', auth, async (req, resp) => {
  try {
    const {hashId, size, fileName, type, appId, forDownload, downloadUrl, fileDBId} = req.body;
  } catch (error) {
    console.log(error);
    resp.status(400).send(error);
  }
});

// 计算浏览次数
router.get('/user/download', async (req, resp) => {
  const {fileHash} = req.query;

  try {
    const {downloadTimes, name, appId, size, icon: fileIcon, version: fileVersion, description} = await File.findOne({hashId: fileHash});
    const {name: appName, owner, icon: appIcon, version: appVersion} = await App.findOne({appId});
    const newTimes = parseInt(downloadTimes) + 1;
    await File.update({hashId: fileHash}, {$set: {downloadTimes: newTimes.toString()}});
    resp.send({
      code: 200, message: '', data: {
        fileHash,
        appName,
        icon: fileIcon ? fileIcon : appIcon,
        version: fileVersion ? fileVersion : appVersion,
        email: owner,
        fileName: name,
        description: description ? description : '还没有任何描述',
        size,
        appId
      }
    });
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 获得可用流量
router.get('/user/quota', async (req, resp) => {
  try {
    const {email} = req.query;

    const user = await User.findOne({email}).exec();
    const {quota} = user;

    resp.send({code: 200, message: '', data: quota});
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 扣除流量
router.post('/user/quota', async (req, resp) => {
  try {
    const {usedQuota, email} = req.body;

    const usedQuotaNumber = parseFloat(usedQuota);
    const user = await User.findOne({email}).exec();
    const {quota} = user;
    const leftQuota = parseFloat(quota) - usedQuotaNumber;

    if (leftQuota <= 0) {
      resp.status(400).send('Quota is not enough for download.');
    }

    await User.update({email}, {$set: {quota: leftQuota.toString()}});

    resp.send({code: 200, message: '', data: leftQuota});
  } catch (error) {
    resp.status(400).send(error);
  }
});

module.exports = router;
