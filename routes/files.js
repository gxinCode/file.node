const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer'); //multer 实现上传文件
const call_sh = require('child_process');
const qr = require('qr-image');

const router = express.Router();

let confFileName = 'server.json';
let FILE_PATH = 'public/files/';
let CACHE_PATH = 'uploads/';
let CONF;
if (fs.existsSync(confFileName)) {
    CONF = JSON.parse(fs.readFileSync(confFileName, 'utf8'));
    console.log(JSON.stringify(CONF));
    if (CONF.path)
        FILE_PATH = CONF.path;
    if (CONF.upcache)
        CACHE_PATH = CONF.upcache;
}
console.log('files FILE_PATH = ' + FILE_PATH);

router.get('/', function (req, res, next) {
    let cDir = '';
    if (!req.query.dir) {
        console.log('default');
    } else {
        cDir = req.query.dir;
    }

    //处理一下路径里多余的路径分隔符
    let spDir = cDir.split('/');
    cDir = '/';
    for (let k = 0; k < spDir.length; k++) {
        if (spDir[k] !== '') {
            cDir += spDir[k] + '/';
        }
    }

    //防止目录嗅探
    spDir = cDir.split('/');
    let w = 0;
    for (let k = 0; k < spDir.length; k++) {
        if (spDir[k] !== '') {
            let t = spDir[k];
            if (t === '..') {
                w--;
            } else if (t !== '.') {
                w++;
            }
        }
    }
    spDir = null;
    if (w < 0) {
        res.render('error_info', {title: "错误", message: '未找到目录："' + cDir + '"'});
        return;
    }

    let tDir = FILE_PATH + cDir;
    fs.readdir(tDir, function (err, files) {
        if (err) {
            console.log(err);
            res.render('error_info', {title: "错误", message: '未找到目录："' + cDir + '"'});
            return;
        }
        let dataDir = [];
        let dataFile = [];
        for (let i = 0; i < files.length; i++) {
            if (!req.session.adnimStatus && files[i].startsWith(".", 0))
                continue;
            let st = fs.statSync(tDir + files[i]);
            let iconImg = '/images/img_file.png';
            let path;
            let sizeStr = '';
            let delPath = "/files/edit?type=del&path=" + cDir + files[i] +
                '&jump=' + (cDir === '' ? '/' : cDir);
            let renamePath = "/files/edit?type=rename&path=" + cDir + files[i] +
                '&jump=' + (cDir === '' ? '/' : cDir) + '&newname=';
            if (st.isDirectory()) {
                iconImg = '/images/img_dir.png';
                path = encodeURI("/files?dir=" + cDir + files[i]);
                dataDir.push({
                    name: files[i],
                    path: path,
                    icon: iconImg,
                    size: sizeStr,
                    delPath: delPath,
                    renamePath: renamePath
                });
            }
            else if (st.isFile()) {
                iconImg = '/images/img_file.png';
                //图片预览
                if (st.size < CONF.thumbSize * 1024 && isImage(files[i])) {
                    iconImg = encodeURI("/files/getfile?path=" + cDir + files[i]);
                }
                path = encodeURI("/files/getfile?path=" + cDir + files[i]);
                let fh = 'B';
                let sizet = st.size;
                if (sizet >= 1024) {
                    sizet /= 1024;
                    fh = 'KB';
                    if (sizet >= 1024) {
                        sizet /= 1024;
                        fh = 'MB';
                        if (sizet >= 1024) {
                            sizet /= 1024;
                            fh = 'GB';
                        }
                    }
                }
                sizeStr = '' + sizet.toFixed(2) + fh;

                dataFile.push({
                    name: files[i],
                    path: path,
                    icon: iconImg,
                    size: sizeStr,
                    delPath: delPath,
                    renamePath: renamePath,
                });
            }
        }

        let data = [];
        for (let i = 0; i < dataDir.length; i++) {
            data.push(dataDir[i]);
        }
        for (let i = 0; i < dataFile.length; i++) {
            data.push(dataFile[i]);
        }

        res.render('files', {
            title: 'Files',
            path: cDir === '' ? '/' : cDir,
            fileInfos: data,
            conf: CONF,
            admin: req.session.adnimStatus
        });
    });
});

// 拿文件
router.get('/getfile', function (req, res, next) {
    console.log('getfile: ' + req.query.path);
    let filePath = path.join(FILE_PATH, req.query.path);
    fs.exists(filePath, function (exists) {
        if (exists) {
            fs.stat(filePath, function (err, stats) {
                if (stats.isFile()) {
                    let fi = filePath.lastIndexOf('/');
                    let fileName = '';
                    if (fi >= 0) {
                        fileName = filePath.substr(fi + 1, filePath.length);
                    }
                    console.log('getfile sendfile: ' + filePath + ' name: ' + fileName);
                    // res.sendfile(filePath);
                    res.download(filePath, fileName);
                } else {
                    res.render('error_info', {title: "错误", message: '文件不存在："' + req.query.path + '"'});
                }
            });
        } else {
            res.render('error_info', {title: "错误", message: '文件不存在："' + req.query.path + '"'});
        }
    });
});

// dest 存储目录；fileUpload 要和表单中file的name匹配
let upload = multer({dest: CACHE_PATH}).single('file');

// 上传文件
router.post('/upload', function (req, res, next) {
    if (!req.session.adnimStatus && !CONF.upload) {
        console.warn('upload 无权限');
        res.send('你没有权限上传文件');
        return;
    }
    console.log('upload');
    upload(req, res, function (err) {
        if (err) {
            console.error('upload fail: ' + err);
            res.send('上传失败');
            return;
        }
        let savePath = req.body.path;
        let fileName = req.file.filename;
        let upName = req.file.originalname.split('&').join('');
        if (upName === '' || upName.startsWith('.')) {
            upName = fileName + upName;
        }
        let oldPath = path.join(CACHE_PATH, fileName);
        let newPath = path.join(FILE_PATH, savePath, upName);
        console.log('upload file:');
        console.log('\toldPath: ' + oldPath);
        console.log('\tnewPath: ' + newPath);
        fs.exists(newPath, function (exists) {
            if (exists) {
                //如果文件已存在，组合一个新名字，如果还存在服务端不再处理
                newPath = path.join(FILE_PATH, savePath, fileName.substring(0, 10) + '_' + upName);
            }
            fs.rename(oldPath, newPath, function (err) {
                if (err) {
                    console.error('上传失败，归档错误');
                    res.send('上传失败，归档错误');
                } else {
                    console.log('上传成功: ' + upName);
                    res.send('上传成功: ' + upName);
                }
            });
        });
    });
});

router.get('/mkdir', function (req, res, next) {
    if (!req.session.adnimStatus && !CONF.mkdir) {
        res.send('你没有权限新建目录');
        return;
    }
    if (!req.query.dirname) {
        res.send('参数错误');
    } else {
        let dirPath = path.join(FILE_PATH, req.query.dirname.split('&').join(''));
        console.log('mkdir: ' + dirPath);
        if (dirPath === '') {
            res.send('目录创建失败');
            return;
        }
        fs.exists(dirPath, function (exists) {
            if (exists) {
                res.send('目录已存在');
            } else {
                fs.mkdir(dirPath, function (err) {
                    if (err) {
                        res.send('目录创建失败');
                    } else {
                        res.send('目录创建成功');
                    }
                });
            }
        });
    }
});

// 管理员验证
router.post('/adminlogin', function (req, res, next) {
    let pwd = req.body.passwd;
    if (pwd && pwd === CONF.adnimPwd) {
        req.session.adnimStatus = true;
        console.log('adnimlogin success');
    }
    res.send('success');
});

router.get('/adminlogout', function (req, res, next) {
    req.session.adnimStatus = false;
    res.send('success');
});

router.get('/edit', function (req, res, next) {
    if (!req.session.adnimStatus) {
        res.render('error_info', {title: "错误", message: '操作失败, 权限不足'});
        return;
    }
    if (req.query.type) {
        let type = req.query.type;
        if (type === 'del') {
            deleteFileDir(req, res);
        } else if (type === 'rename') {
            renameFile(req, res);
        } else {
            res.render('error_info', {title: "错误", message: '无效操作'});
        }
    } else {
        res.render('error_info', {title: "错误", message: '不正确的参数'});
    }
});

router.get('/getbulk', function (req, res, next) {
    if (!req.session.adnimStatus) {
        res.send('权限不足');
        return;
    }

    let dir = '';
    if (req.query.path) {
        dir = req.query.path;
    }

    call_sh.exec('du -sh "' + path.join(FILE_PATH, dir) + '"', function (err, out) {
        if (err) {
            res.send('');
        } else {
            res.send(out.split('	')[0]);
        }
    });
});

router.get('/qr', function (req, res, next) {
    let path = '';
    if (req.query.path) {
        path = req.query.path;
    }

    let code = qr.image(path, { type: 'png' });
    code.pipe(res);
});

// functions
let ImgSuffixs = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function isImage(name) {
    for (let i = 0; i < ImgSuffixs.length; i++) {
        if (name.toLowerCase().endsWith(ImgSuffixs[i]))
            return true;
    }
    return false;
}

function deleteFileDir(req, res) {
    if (!req.query.path) {
        res.render('error_info', {title: "错误", message: '不正确的参数'});
    } else {
        let filePath = path.join(FILE_PATH, req.query.path);
        let fileState = fs.statSync(filePath);
        if (fileState.isFile()) {
            fs.unlink(filePath, function (err) {
                if (err) {
                    console.log(err);
                    res.render('error_info', {title: "错误", message: '删除失败 code: ' + err.code});
                    return;
                }
                if (req.query.jump) {
                    console.log('success to jump');
                    res.redirect('/files?dir=' + req.query.jump); //重定向回当前页
                } else {
                    res.send('success');
                }
            });
        } else if (fileState.isDirectory()) {
            fs.rmdir(filePath, function (err) {
                if (err) {
                    console.log(err);
                    res.render('error_info', {title: "错误", message: '删除失败 code: ' + err.code});
                    return;
                }
                if (req.query.jump) {
                    console.log('success to jump');
                    res.redirect('/files?dir=' + req.query.jump); //重定向回当前页
                } else {
                    res.send('success');
                }
            });
        } else {
            res.render('error_info', {title: "错误", message: '删除失败'});
        }
    }
}

function renameFile(req, res) {
    if (!req.query.path || !req.query.newname || !req.query.jump) {
        res.render('error_info', {title: "错误", message: '不正确的参数' + JSON.stringify(req.query)});
    } else {
        let filePath = path.join(FILE_PATH, req.query.path);
        // let fileState = fs.statSync(filePath);
        let newName = req.query.newname;
        let cdir = req.query.jump;
        let newPath = path.join(FILE_PATH, cdir, newName);
        if (newName === '') {
            res.render('error_info', {title: "错误", message: '新名字不能为空'});
        } else {
            fs.rename(filePath, newPath, function (err) {
                if (err) {
                    console.log(err);
                    res.render('error_info', {title: "错误", message: '重命名失败 code: ' + err.code});
                    return;
                }
                console.log('success to jump');
                res.redirect('/files?dir=' + cdir); //重定向回当前页
            });
        }
    }
}

module.exports = router;
