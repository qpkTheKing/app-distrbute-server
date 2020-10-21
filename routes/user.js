const express = require('express');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const User = require('../models/User');
const File = require('../models/File');
const App = require('../models/App');
const { v4: uuidv4 } = require('uuid');
const PkgReader = require('reiko-parser');
const imagesEngine = require('images');
const svg2png = require('svg2png');
const text2svg = require('text-to-svg');
const got = require('got');

const router = express.Router();

async function hasExistsFile(email, appId, fileDbId) {
  const userWithApps = await User.aggregate([
    {
      $match: { email }
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

// 创建用户
router.post('/user/register', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    const token = await user.generateAuthToken();
    res.status(201).send({ token });
  } catch (error) {
    res.status(400).send(error);
  }
});

// 登陆
router.post('/user/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findByCredentials(email, password);
    if (!user) {
      return res.status(401).send({ error: 'Login failed! Check authentication credentials' });
    }
    const token = await user.generateAuthToken();
    res.send({ token });
  } catch (error) {
    res.status(400).send(error);
  }
});

// 查询个人信息
router.get('/user/me', auth, async (req, res) => {
  const { email } = req.user;
  const result = await User.find({ email });
  const { name, quota, role, created } = result[0];
  res.send({ code: 200, message: '', data: { name, email, quota, created, role } });
});

// 创建新的APP
router.post('/user/app', auth, async (req, resp) => {
  try {
    const { name } = req.body;
    const user = req.user;
    const uuid = uuidv4().split('-').join('');

    const newApp = new App({ name, appId: uuid, owner: user.email });
    await newApp.save();

    await User.update({ email: user.email }, { $addToSet: { apps: [newApp._id] } });

    resp.send({ code: 200, message: 'DONE' });
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 查询用户APP
router.get('/user/app', auth, async (req, resp) => {
  const { email } = req.user;
  const { appId } = req.query;
  let resultApp;

  try {
    const userWithApps = await User.aggregate([
      {
        $match: { email }
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

    resp.send({ code: 200, data: resultApp, message: '' });
  } catch (error) {
    console.log(error);
    resp.status(400).send(error);
  }
});

// 删除APP Files.
router.delete('/user/app/file', auth, async (req, resp) => {
  const { fileId, appId } = req.query;

  const { name } = File.findOne({ hashId: fileId });
  const finalPkgPath = path.resolve(process.cwd(), 'uploader', 'pkgs', `${fileId}-${name}`);
  const uploadedFilePath = path.resolve(process.cwd(), 'uploader', 'data', name);

  try {
    fs.accessSync(finalPkgPath, fs.constants.R_OK | fs.constants.W_OK);
    fs.accessSync(uploadedFilePath, fs.constants.R_OK | fs.constants.W_OK);
    fs.unlink(finalPkgPath, err => {
      if (err && err.code === 'ENOENT') {
        console.info(`File ${finalPkgPath} doesn't exist, won't remove it.`);
      } else if (err) {
        // other errors, e.g. maybe we don't have enough permission
        console.error(`Error occurred while trying to remove file ${finalPkgPath}`);
        resp.status(500).send(err);
      } else {
        fs.unlink(uploadedFilePath, async err => {
          if (err && err.code === 'ENOENT') {
            console.info(`File ${finalPkgPath} doesn't exist, won't remove it.`);
          } else if (err) {
            // other errors, e.g. maybe we don't have enough permission
            console.error(`Error occurred while trying to remove file ${finalPkgPath}`);
            resp.status(500).send(err);
          } else {
            // delete table record.
            await App.findOne({ _id: appId }).update({}, { $pull: { files: fileId } }, { multi: true });
            resp.send({ code: 200, message: 'DONE', data: [] });
          }
        });
      }
    });
  } catch (e) {
    console.log(e);
    resp.status(500).send(e);
  }
});

// 客户端上传包后用来获取APP的包文件上下文信息
router.get('/user/app/pkg', auth, async (req, resp) => {
  const { pkgHashId, pkgFileName } = req.query;
  const finalPkgPath = path.resolve(process.cwd(), 'uploader', 'pkgs', `${pkgHashId}-${pkgFileName}`);
  const uploadedFilePath = path.resolve(process.cwd(), 'uploader', 'data', pkgHashId);

  try {
    fs.copyFileSync(uploadedFilePath, finalPkgPath);

    const fileState = fs.statSync(uploadedFilePath);
    const reader = new PkgReader(finalPkgPath, 'apk', { withIcon: true });

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

// 处理苹果MobileConfig文件
router.post('/user/app/mobileConfig', auth, async (req, resp) => {
  const { email } = req.user;
  const { pkgHashId, pkgFileName, pkgFileId, description, forDownload, version, appId } = req.body;
  const downloadServer = 'http://198.13.52.160:4000';
  let appFile = null;

  try {
    if (pkgHashId) {
      const finalPkgPath = path.resolve(process.cwd(), 'uploader', 'mobileConfigs', `${pkgHashId}-${pkgFileName}`);
      const uploadedFilePath = path.resolve(process.cwd(), 'uploader', 'data', pkgHashId);
      const fileState = fs.statSync(uploadedFilePath);
      fs.copyFileSync(uploadedFilePath, finalPkgPath);
      if (pkgFileId) {
        if (await hasExistsFile(email, appId, pkgFileId)) {
          await File.updateOne({ _id: pkgFileId }, {
            $set: {
              name: pkgFileName,
              hashId: pkgHashId,
              size: fileState.size,
              forDownload,
              description,
              version,
              downloadUrl: `${downloadServer}/${pkgHashId}-${pkgFileName}`,
              appleUpdated: Date.now()
            }
          });
        }
      } else {
        appFile = new File({
          appId,
          name: pkgFileName,
          fType: 'mobile-config',
          hashId: pkgHashId,
          size: fileState.size,
          downloadTimes: "0",
          forDownload,
          description,
          version,
          downloadUrl: `${downloadServer}/${pkgHashId}-${pkgFileName}`
        });
        await appFile.save();
        await App.update({ appId }, { $addToSet: { files: [appFile._id] } });
      }
      resp.send({
        code: 200, message: '', data: {
          size: fileState.size,
          downloadUrl: `${downloadServer}/uploader/mobileConfigs/${pkgHashId}-${pkgFileName}`
        }
      });
    } else {
      await File.updateOne({ _id: pkgFileId }, {
        $set: {
          description,
          forDownload,
          appleUpdated: Date.now()
        }
      });
      resp.send({
        code: 200, message: 'update successfully done.', data: {}
      });
    }
  } catch (error) {
    console.log(error);
    resp.status(500).send(error);
  }
});

// 客户端上传文件后添加对应的数据库条目
router.post('/user/app/file', auth, async (req, resp) => {
  try {
    const { email } = req.user;
    const { hashId, size, fileName, fType, appId, forDownload, downloadUrl, appDescription, pkgMeta, fileDbId } = req.body;

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
        const { files } = await App.findOne({ appId });
        if (files.length === 0) {
          await App.update({ appId }, {
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
        if (await hasExistsFile(email, appId, fileDbId)) {
          await File.updateOne({ _id: fileDbId }, {
            $set: {
              name: fileName,
              description: appDescription,
              downloadUrl,
              forDownload,
              fType,
              size,
              hashId,
              version,
              applicationId,
              versionCode,
              sha1,
              icon,
              updated: Date.now()
            }
          });
        }
      } else {
        const newFile = new File({
          hashId,
          appId,
          name: fileName,
          size,
          fType,
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
        await App.update({ appId }, { $addToSet: { files: [newFile._id] } });
      }
    } else {
      if (fileDbId) {
        if (await hasExistsFile(email, appId, fileDbId)) {
          await File.updateOne({ _id: fileDbId }, {
            $set: {
              description: appDescription,
              forDownload: forDownload,
              fType,
            }
          });
        }
      }
    }

    resp.send({ code: 200, message: 'DONE', data: [] });
  } catch (error) {
    console.log(error);
    resp.status(400).send(error);
  }
});

// 查询指定品牌下的文件
router.get('/user/app/files', auth, async (req, resp) => {
  const { email } = req.user;
  const { appId } = req.query;

  try {
    const result = await User.find({ email }).populate({
      path: "apps",
      populate: { path: "files" }
    }).exec();

    const ownerdApps = result[0]['apps'].filter(app => {
      return app.appId === appId;
    });

    resp.send({ code: 200, message: '', data: ownerdApps[0]['files'] });
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 查询指定文件的信息
router.get('/user/app/file', auth, async (req, resp) => {
  const { fileId } = req.query;
  try {
    const file = await File.findOne({ _id: fileId });
    resp.send({ code: 200, message: '', data: file });
  } catch (error) {
    console.log(error);
    resp.status(400).send(error);
  }
});

// 删除指定品牌下得文件
router.delete('/user/app', auth, async (req, resp) => {
  const { appId, hashId } = req.query;
  const { email } = req.user;

  try {
    const allApps = await User.find({ email }).populate({
      path: "apps",
      populate: { path: "files" }
    }).exec();

    const apps = allApps[0]['apps'].filter(app => {
      return app.appId === appId;
    });

    if (apps.length > 0) {
      for (const app of apps) {
        const { files } = app;
        if (hashId) {
          await File.findOneAndDelete({ hashId });
          resp.send({ code: 200, message: 'Delete File Successful.', data: '' });
        } else {
          if (files.length > 0) {
            for (const file of files) {
              await File.findOneAndDelete({ _id: file._id });
            }
          }
          await App.findOneAndDelete({ _id: app._id });
          resp.send({ code: 200, message: 'Delete App Successful.', data: '' });
        }
      }
    } else {
      resp.send({ code: 400, message: 'App Id Not Exists.', data: '' });
    }

  } catch (error) {
    console.log(error);
    resp.status(500).send(error);
  }
});

// 根据APPID返回激活状态得包
router.get('/user/download/app', async (req, resp) => {
  const { appId } = req.query;

  try {
    // 获得当前用户得品牌
    const app = await App.findOne({ appId }).populate({ path: "files" }).exec();
    const enabledFiles = app.files.filter(file => {
      return file.forDownload === 'TRUE'
    });

    if (enabledFiles.length > 0) {
      resp.send({
        code: 200, message: '', data: {
          files: enabledFiles,
          appName: app.name,
          email: app.owner
        }
      });
    } else {
      resp.send({ code: 400, message: 'App Id Not Exists.', data: '' });
    }

  } catch (error) {
    console.log(error);
    resp.status(500).send(error);
  }
});

router.get('/user/v2/download', async (req, resp) => {
  const { h: fileHash } = req.query;

  try {
    const { } = await File.findOne({ hashId: fileHash });
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 返回指定得下载得包
router.get('/user/download', async (req, resp) => {
  const { fileHash } = req.query;

  try {
    const { downloadTimes, name, appId, size, icon: fileIcon, version: fileVersion, description, downloadUrl, fType, updated } = await File.findOne({ hashId: fileHash });
    const { name: appName, owner, icon: appIcon, version: appVersion } = await App.findOne({ appId });
    const newTimes = parseInt(downloadTimes) + 1;
    await File.update({ hashId: fileHash }, { $set: { downloadTimes: newTimes.toString() } });
    resp.send({
      code: 200, message: '', data: {
        fileHash,
        appName,
        type: fType === 'mobile-config' ? 'ios' : 'android',
        ios: {
          downloadUrl
        },
        icon: fileIcon ? fileIcon : appIcon,
        version: fileVersion ? fileVersion : appVersion,
        email: owner,
        fileName: name,
        description: description ? description : '还没有任何描述',
        size,
        appId,
        updated
      }
    });
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 设置可用流量
router.post('/user/quota/add', async (req, resp) => {
  try {
    const { usedQuota, email } = req.body;

    const usedQuotaNumber = parseFloat(usedQuota);
    const user = await User.findOne({ email }).exec();
    const { quota } = user;
    const newQuota = parseFloat(quota) + usedQuotaNumber;

    await User.update({ email }, { $set: { quota: newQuota.toString() } });

    resp.send({ code: 200, message: '', data: newQuota.toFixed(2) });
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 获得可用流量
router.get('/user/quota', async (req, resp) => {
  try {
    const { email } = req.query;

    const user = await User.findOne({ email }).exec();
    const { quota } = user;

    resp.send({ code: 200, message: '', data: quota });
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 扣除流量
router.post('/user/quota', async (req, resp) => {
  try {
    const { usedQuota, email } = req.body;

    const usedQuotaNumber = parseFloat(usedQuota);
    const user = await User.findOne({ email }).exec();
    const { quota } = user;
    const leftQuota = parseFloat(quota) - usedQuotaNumber;

    if (leftQuota <= 0) {
      resp.status(400).send('Quota is not enough for download.');
    }

    await User.update({ email }, { $set: { quota: leftQuota.toString() } });

    resp.send({ code: 200, message: '', data: leftQuota.toFixed(2) });
  } catch (error) {
    resp.status(400).send(error);
  }
});

// 管理

// 获得所有用户
router.get('/user/admin/users', async (req, resp) => {
  const { name } = req.query;
  try {
    if (name) {
      // todo: 需要添加过滤能力
    } else {
      const allUsers = await User.find();
      resp.send({ code: 200, message: '', data: allUsers });
    }
  } catch (error) {
    console.log(error);
    resp.status(500).send(error);
  }
});

// 管理用户流量
router.post('/user/admin/user/quota', async (req, resp) => {
  const { userId, newQuota } = req.body;

  try {
    const user = await User.findOne({ _id: userId });
    if (user) {
      const { quota } = user;
      const finalQuota = parseFloat(quota) + parseFloat(newQuota);
      await User.updateOne({ _id: userId }, { $set: { quota: finalQuota.toString() } });
    } else {
      resp.status(400).send('User not Exists.');
    }
    resp.send({ code: 200, message: '', data: newQuota.toFixed(2) });
  } catch (error) {
    console.log(error);
    resp.status(500).send(error);
  }
});

router.post('/user/images/sale', async (req, resp, next) => {
  const { texts, images } = req.body;
  const uuid = uuidv4().split('-').join('');

  try {
    let textImageWidth = 0;
    const attributes = {fill: 'white', stroke: 'gray'};
    const tts = text2svg.loadSync(path.join(process.cwd(), 'config', 'msyh.ttf'));
    const bgImage = imagesEngine(path.join(process.cwd(), 'config', 'Red-Background.jpg'));
    const width = bgImage.width();
    // render text.
    for (let i = 0; i < texts.length; i++) {
      const tSvg = tts.getSVG(texts[i], {
        x: 0,
        y: 0,
        fontSize: 96,
        anchor: 'top',
        attributes
      });
      const textSvg = await svg2png(tSvg);
      const textImage = imagesEngine(textSvg);
      textImageWidth = textImage.width();
      bgImage.draw(textImage, width / 20 , 200 * ( i + 1 ));
    }
    const selectedTemplateFont = tts.getSVG('选定得模板:  ', {
      x: 0,
      y: 0,
      fontSize: 80,
      anchor: 'top',
      attributes
    });
    const textSelectedTemplateSvg = await svg2png(selectedTemplateFont);
    const selectedTemplateFontImage = imagesEngine(textSelectedTemplateSvg);
    // bgImage.draw(selectedTemplateFontImage, width / 20 , selectedTemplateFontImage.width() * texts.length - 400);
    // render images.
    const templateSavePath = path.join(__dirname, `../tmp/template.${uuid}.jpg`);
    const mobileImageBuffer = await got(images.mobile).buffer();
    const pcImageBuffer = await got(images.pc).buffer();
    const mobileImage = imagesEngine(mobileImageBuffer).size(1080, 1920);
    bgImage.draw(mobileImage, width / 20, 1000);
    const pcImage = imagesEngine(pcImageBuffer).size(1920, 1080);
    bgImage.draw(pcImage, width / 20 + mobileImage.width() + 100, 1000);
    // save
    await bgImage.save(templateSavePath);
    // over
    resp.send({ code: 200, message: '', data: {
      url: `http://149.28.28.240:4000/template.${uuid}.jpg`
    }});
  } catch (error) {
    console.log(error);
    resp.status(500).send(error);
  }

});

module.exports = router;
