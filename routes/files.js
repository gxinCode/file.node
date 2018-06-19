var express = require('express');
var fs = require('fs');
var path = require('path');
var multer = require('multer'); //multer 实现上传文件
var call_sh = require('child_process');

var router = express.Router();

var confFileName = 'server.json';
var FILE_PATH = 'public/files/';
var CACHE_PATH = 'uploads/';
var CONF;
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
    var cDir = '';
    if (!req.query.dir) {
        console.log('default');
    } else {
        cDir = req.query.dir;
    }

    //处理一下路径里多余的路径分隔符
    var spDir = cDir.split('/');
    cDir = '/';
    for (var k = 0; k < spDir.length; k++) {
        if (spDir[k] !== '') {
            cDir += spDir[k] + '/';
        }
    }

    //防止目录嗅探
    spDir = cDir.split('/');
    var w = 0;
    for (var k = 0; k < spDir.length; k++) {
        if (spDir[k] !== '') {
            var t = spDir[k];
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

    var tDir = FILE_PATH + cDir;
    fs.readdir(tDir, function (err, files) {
        if (err) {
            console.log(err);
            res.render('error_info', {title: "错误", message: '未找到目录："' + cDir + '"'});
            return;
        }
        var dataDir = [];
        var dataFile = [];
        for (var i = 0; i < files.length; i++) {
            if (!req.session.adnimStatus && files[i].startsWith(".", 0))
                continue;
            var st = fs.statSync(tDir + files[i]);
            var iconImg = '/images/img_file.png';
            var path;
            var sizeStr = '';
            var delPath = "/files/edit?type=del&path=" + cDir + files[i] +
                '&jump=' + (cDir === '' ? '/' : cDir);
            var renamePath = "/files/edit?type=rename&path=" + cDir + files[i] +
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
                var fh = 'B';
                var sizet = st.size;
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
                    renamePath: renamePath
                });
            }
        }

        var data = [];
        for (var i = 0; i < dataDir.length; i++) {
            data.push(dataDir[i]);
        }
        for (var i = 0; i < dataFile.length; i++) {
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
    var filePath = path.join(FILE_PATH, req.query.path);
    fs.exists(filePath, function (exists) {
        if (exists) {
            fs.stat(filePath, function (err, stats) {
                if (stats.isFile()) {
                    var fi = filePath.lastIndexOf('/');
                    var fileName = '';
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
var upload = multer({dest: CACHE_PATH}).single('file');

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
        var savePath = req.body.path;
        var fileName = req.file.filename;
        var upName = req.file.originalname.split('&').join('');
        if (upName === '' || upName.startsWith('.')) {
            upName = fileName + upName;
        }
        var oldPath = path.join(CACHE_PATH, fileName);
        var newPath = path.join(FILE_PATH, savePath, upName);
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
        var dirPath = path.join(FILE_PATH, req.query.dirname.split('&').join(''));
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
    var pwd = req.body.passwd;
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
        var type = req.query.type;
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

    var dir = '';
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

// functions
var ImgSuffixs = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function isImage(name) {
    for (var i = 0; i < ImgSuffixs.length; i++) {
        if (name.toLowerCase().endsWith(ImgSuffixs[i]))
            return true;
    }
    return false;
}

function deleteFileDir(req, res) {
    if (!req.query.path) {
        res.render('error_info', {title: "错误", message: '不正确的参数'});
    } else {
        var filePath = path.join(FILE_PATH, req.query.path);
        var fileState = fs.statSync(filePath);
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
        var filePath = path.join(FILE_PATH, req.query.path);
        // var fileState = fs.statSync(filePath);
        var newName = req.query.newname;
        var cdir = req.query.jump;
        var newPath = path.join(FILE_PATH, cdir, newName);
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
