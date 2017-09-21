"use strict";
const express       = require('express'),
      https         = require('https'),
      fs            = require('fs'),
      streamBuffers = require('stream-buffers'),
      path          = require('path'),
      bodyParser    = require('body-parser'),
      fileUpload    = require('express-fileupload'),
      archiver      = require('archiver'),
      cookieParser  = require('cookie-parser'),
      cp            = require('child_process'),
      db            = require('./database.js'),
      auth          = require('./auth.js'),
      config        = require('./config/config.js'),
      app           = express(),
      drives        = path.join(__dirname, '../cloud-drive'),
      url           = config.url;

var superusers = {
    ddakev: {invite: null}
}

const ssl_opts = {
    key: fs.readFileSync('ssl/server.key'),
    cert: fs.readFileSync('ssl/server.crt')
};

const redirect_script = `<body><script>window.location.href = "${url}/login";</script></body>`;

// Allow only this website to access API
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", `${url}`);
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Credentials", true);
    next();
});

app.use(cookieParser());
app.use(express.static("public"));

app.all(['/login', '/users'], function(req, res, next) {
    db.parseCookie(req.cookies).then(function(uname) {
        // if cookie present and valid, redirect to '/', otherwise continue with routes below
        if(uname) {
            res.send(null);
        }
        else {
            next();
        }
    }).catch(function(err) {
        next();
    });
});

app.all(['/', '/api/*', '/users/:id', '/invite', '/username'], function(req, res, next) {
    db.parseCookie(req.cookies).then(function(uname) {
        if(uname) {
            if(req.path == '/username') {
                res.send({username: uname, superuser: superusers[uname]?true:false});
            }
            else {
                req.username = uname;
                next();
            }
        }
        else {
            res.status(403).send(redirect_script);
        }
    }).catch(function(err) {
        res.status(403).send(redirect_script);
    });
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(fileUpload());

// Serve icon
app.get('/favicon.ico', function(req, res) {
    fs.createReadStream(path.join(__dirname, "public", "images", "favicon.ico")).pipe(res);
});

// On GET request to /, serve index
app.get('/', function(req, res) {
    res.sendFile(__dirname + "/index.html");
});

app.get('/login', function(req, res) {
    res.sendFile(__dirname + "/login.html");
});

app.post('/login', function(req, res) {
    db.validate(req.body.username, req.body.password).then(function(result) {
        if(result) {
            db.getCookie(req.body.username).then(function(cookie) {
                let expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
                res.cookie("DL", cookie, {secure: true, httpOnly: true, expires: expires}).end();
            }).catch(function(err) {
                res.status(403).send(null);
            });
        }
        else {
            console.log("wrong credentials");
            res.status(403).send(null);
        }
    }).catch(function(err) {
        res.status(403).send(err);
    });
});

app.get('/logout', function(req, res) {
    res.clearCookie("DL").end();
});

app.get('/users/:id', function(req, res) {
    db.get(req.params.id).then(function(result) {
        res.send(result);
    }).catch(function(err) {
        res.send(result);
    });
});

app.post('/users', function(req, res) {
    // Validate invite code
    let found = false;
    for(var user in superusers) {
        if(superusers.hasOwnProperty(user)) {
            if(superusers[user].invite && req.body.token == superusers[user].invite.token) {
                if(Date.now() <= superusers[user].invite.expires) {
                    found = true;
                    break;
                }
                else {
                    superusers[user].invite = null;
                }
            }
        }
    }
    if(!found) {
        res.status(403).send("Token incorrect or expired");
        return;
    }
    // Validate fields
    if(req.body.username.length<6) {
        res.status(400).send("Username needs to have at least 6 characters.");
        return;
    }
    if(req.body.username.length>128) {
        res.status(400).send("Username cannot have more than 128 characters.");
        return;
    }
    if(req.body.password.length < 6) {
        res.status(400).send("Password needs to have at least 6 characters.");
        return;
    }
    if(req.body.password.length > 256) {
        res.status(400).send("Password cannot have more than 256 characters.");
        return;
    }
    db.get(req.body.username).then(function(result) {
        if(result && result.length > 0) {
            res.status(400).send("Username " + req.body.username + " already exists.");
            return;
        }
        db.create(req.body).then(function(result) {
            db.getCookie(req.body.username).then(function(cookie) {
                res.cookie("DL", cookie, {secure: true, httpOnly: true}).end();
            }).catch(function(err) {
                res.status(403).send(null);
            });
        }).catch(function(err) {
            res.send(result);
        });
    }).catch(function(err) {
        db.create(req.body).then(function(result) {
            fs.mkdir(path.join(drives, req.body.username), function() {
                db.getCookie(req.body.username).then(function(cookie) {
                    res.cookie("DL", cookie, {secure: true, httpOnly: true}).end();
                }).catch(function(err) {
                    res.status(403).send(null);
                });
            });
        }).catch(function(err) {
            res.send(result);
        });
    });
});

app.put('/users/:id', function(req, res) {
    db.update(req.params.id, req.body).then(function(result) {
        res.send(result);
    }).catch(function(err) {
        res.send(result);
    });
});

app.delete('/users/:id', function(req, res) {
    db.remove(req.params.id).then(function(result) {
        res.send(result);
    }).catch(function(err) {
        res.send(result);
    });
});

app.get('/invite', function(req, res) {
    if(superusers[req.username] == undefined) {
        res.status(403).send(null);
    }
    else {
        let invite = {token: auth.getToken(8), expires: Date.now()+60*1000};
        superusers[req.username].invite = invite;
        res.send(invite);
    }
});

// Get a list of files, and information about them, in directory specified by req.body.path; separate them into directories and files,
// and mark directories with subdirectories
app.post('/api/files', function(req, res) {
    let root = path.join(drives, req.username);
    fs.readdir(path.join(root, req.body.path), function(err, files) {
        if(err) {
            res.send("Error!");
        }
        else {
            let dirList = [];
            let fileList = [];
            for(let i=0; i<files.length; i++) {
                let info = fs.statSync(path.join(root, req.body.path, files[i]));
                if(info.isDirectory()) {
                    let subFiles = fs.readdirSync(path.join(root, req.body.path, files[i]));
                    let containSubDirs = false;
                    for(let j=0; j<subFiles.length; j++) {
                        if(fs.statSync(path.join(root, req.body.path, files[i], subFiles[j])).isDirectory()) {
                            containSubDirs = true;
                            break;
                        }
                    }
                    dirList.push({
                        filename: files[i],
                        info: info,
                        hasSubs: containSubDirs
                    })
                }
                else {
                    fileList.push({
                        filename: files[i],
                        info: info
                    });
                }
            }
            res.send({directories: dirList, files: fileList});
        }
    });
});

// Get size of a directory specified by req.body.path
app.post('/api/size', function(req, res) {
    getSize(path.join(drives, req.username, req.body.path)).then(function(size) {
        res.send({size: size});
    }).catch(function(err) {
        res.send(err);
    });
});

// Upload file request
app.post('/api/upload', function(req, res) {
    let root = path.join(drives, req.username);
    let filename = path.join(root, req.body.path, req.files.file.name);
    let fd = fs.createWriteStream(filename);
    fd.write(req.files.file.data, function(err) {
        fd.close();
        if(err) {
            res.write(err);
        }
        else {
            res.write("ok");
        }
        res.end();
    });
});

// Rename file request
app.post('/api/rename', function(req, res) {
    let root = path.join(drives, req.username);
    fs.rename(path.join(root, req.body.path, req.body.oldname), path.join(root, req.body.path, req.body.newname), function(err) {
        if(err) console.log(err);
        res.send("ok");
    });
});

// Remove request
app.post('/api/remove', function(req, res) {
    removeFiles(path.join(drives, req.username, req.body.path)).then(function(result) {
        res.send("ok");
    }).catch(function(err) {
        console.log(err);
        res.send(err);
    });
});

// Download request
app.post('/api/download', function(req, res) {
    let root = path.join(drives, req.username);
    if(req.body.filenames.length == 1) {
        fs.stat(path.join(root, req.body.path, req.body.filenames[0]), function(err, stats) {
            if(err) {
                res.send(err);
            }
            else {
                if(stats.isFile()) {
                    res.download(path.join(root, req.body.path, req.body.filenames[0]));
                }
                else {
                    let archive = archiver("zip");
                    res.setHeader("Content-Type", "application/zip");
                    res.attachment(req.body.filenames[0] + ".zip");
                    archive.pipe(res);
                    archive.directory(path.join(root, req.body.path, req.body.filenames[0]), req.body.filenames[0]);
                    archive.finalize();
                }
            }
        });
    }
    else {
        let archive = archiver("zip");
        res.setHeader("Content-Type", "application/zip");
        res.attachment("download.zip");
        archive.pipe(res);
        let waitlist = [];
        for(let i=0; i<req.body.filenames.length; i++) {
            let fn = req.body.filenames[i];
            waitlist.push(new Promise(function(resolve, reject) {
                fs.stat(path.join(root, req.body.path, fn), function(err, stats) {
                    if(err) {
                        res.send(err);
                    }
                    else {
                        if(stats.isFile()) {
                            archive.file(path.join(root, req.body.path, fn), {name: fn});
                        }
                        else {
                            archive.directory(path.join(root, req.body.path, fn), fn);
                        }
                        resolve();
                    }
                });
            }));
        }
        Promise.all(waitlist).then(function(vals) {
            archive.finalize();
        });
    }
});

// New folder request
app.post("/api/new_folder", function(req, res) {
    let root = path.join(drives, req.username);
    fs.mkdir(path.join(root, req.body.path, req.body.name), function() {
        res.send("ok");
    });
});

// Cut-paste (move) action request
app.post("/api/cut", function(req, res) {
    let root = path.join(drives, req.username);
    let waitlist = [];
    req.body.files.forEach(function(file) {
        // prompt if user wants to replace file that already exists in new path
        waitlist.push(new Promise(function(resolve, reject) {
            fs.rename(path.join(root, req.body.from, file), path.join(root, req.body.to, file), function(err, fname) {
                if(err) reject(err);
                else resolve(fname);
            });
        }));
    });
    Promise.all(waitlist).then(function(fnames) {
        res.send(fnames);
    }).catch(function(err) {
        res.send(err);
    });
});

// Copy-paste action request
app.post("/api/copy", function(req, res) {
    let root = path.join(drives, req.username);
    let waitlist = [];
    req.body.files.forEach(function(file) {
        waitlist.push(new Promise(function(resolve, reject) {
            fs.stat(path.join(root, req.body.from, file), function(err, stats) {
                if(err) reject();
                else {
                    if(stats.isFile()) {
                        let rs = fs.createReadStream(path.join(root, req.body.from, file));
                        copyFile(rs, path.join(root, req.body.to), file, function(err, fname) {
                            if(err) reject(err);
                            else resolve(fname);
                        });
                    }
                    else {
                        copyDir(file, file, path.join(root, req.body.from), path.join(root, req.body.to), function(err, fname) {
                            if(err) reject(err);
                            else resolve(fname);
                        });
                    }
                }
            });
        }));
    });
    Promise.all(waitlist).then(function(filenames) {
        res.send(filenames);
    }).catch(function(err) {
        res.send(err);
    });
});

// Execute shell command
/* Best to leave this out until some form of login/encryption is implemented
app.post("/api/execute", function(req, res) {
    let params = req.body.command;
    let command = params[0];
    params.splice(0, 1);
    let cmd = cp.spawn(command, params).on("data", function(data) {
        res.write(`${data}`);
    }).on("error", function(err) {
        res.write(`${err}`);
    }).on("close", function(status) {
        res.end();
    });
    req.on("close", function() {
        cmd.kill();
    });
});*/

https.createServer(ssl_opts, app).listen(8080);
console.log("Server listening on port 8080");

// Recursively adds the sizes of files and subdirectories of the given directory; returns a Promise which resolves with the final directory size
function getSize(dirname) {
    return new Promise(function(resolve, reject) {
        fs.readdir(dirname, function(err, files) {
            if(err) {
                reject();
                return;
            }
            let waitlist = [];
            for(let i=0; i<files.length; i++) {
                waitlist.push(new Promise(function(resolve, reject) {
                    fs.stat(path.join(dirname, files[i]), function(err, stats) {
                        if(err) reject();
                        else {
                            if(stats.isDirectory()) {
                                new Promise(function(resolve, reject) {
                                    getSize(path.join(dirname, files[i])).then(function(subsize) {
                                        resolve(subsize);
                                    }).catch(function(e) {
                                        reject(e);
                                    });
                                }).then(function(subsize) {
                                    resolve(subsize + stats.size);
                                }).catch(function(e) {
                                    reject(e);
                                });
                            }
                            else {
                                resolve(stats.size);
                            }
                        }
                    });
                }));
            }
            Promise.all(waitlist).then(function(vals) {
                let size = 0;
                vals.forEach(subsize => { size += subsize; });
                resolve(size);
            }).catch(function(e) {
                reject(e);
            });
        });
    });
}

function removeFiles(location) {
    return new Promise(function(resolve, reject) {
        fs.stat(location, function(err, stats) {
            if(err) {
                reject(err);
                return;
            }
            if(stats.isDirectory()) {
                fs.readdir(location, function(err, files) {
                    if(err) {
                        reject(err);
                        return;
                    }
                    let waitlist = [];
                    for(let i=0; i<files.length; i++) {
                        waitlist.push(removeFiles(path.join(location, files[i])));
                    }
                    Promise.all(waitlist).then(function(vals) {
                        fs.rmdir(location, function(err) {
                            if(err) {
                                reject(err);
                                return;
                            }
                            resolve();
                        });
                    });
                });
            }
            else {
                fs.unlink(location, function(err) {
                    if(err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            }
        });
    });
}

function copyFile(rs, to, fname, callback) {
    new Promise(function(resolve, reject) {
        fs.open(path.join(to, fname), "wx", function(err, fd) {
            if(err) {
                reject(err);
            }
            else {
                resolve(fs.createWriteStream("", {fd: fd}));
            }
        });
    }).then(function(ws) {
        rs.pipe(ws);
        ws.on("error", function(err) {
            if(err.code == "EEXIST") return;
            console.log(err);
        });
        ws.on("finish", function() {
            callback(null, fname);
        });
    }).catch(function(err) {
        let extPos = fname.lastIndexOf(".");
        copyFile(rs, to, fname.substring(0, extPos) + " - Copy" + fname.substring(extPos), callback);
    });
}

function copyDir(fname, tname, from, to, callback) {
    new Promise(function(resolve, reject) {
        fs.stat(path.join(to, tname), function(err, stats) {
            if(err) resolve();
            else reject();
        });
    }).then(function() {
        fs.mkdir(path.join(to, tname), function() {
            copyRecursively(path.join(from, fname), path.join(to, tname), function(err) {
                if(err) callback(err);
                else callback(null, tname);
            });
        });
    }).catch(function() {
        copyDir(fname, tname + " - Copy", from, to, callback);
    });
}

function copyRecursively(fromPath, toPath, callback) {
    fs.readdir(fromPath, function(err, files) {
        if(err) {
            callback(err);
            return;
        }
        let waitlist = [];
        files.forEach(function(file) {
            waitlist.push(new Promise(function(resolve, reject) {
                fs.stat(path.join(fromPath, file), function(err, stats) {
                    if(err) {
                        reject(err);
                        return;
                    }
                    if(stats.isDirectory()) {
                        fs.mkdir(path.join(toPath, file), function() {
                            copyRecursively(path.join(fromPath, file), path.join(toPath, file), function(err) {
                                if(err) reject(err);
                                else resolve();
                            });
                        });
                    }
                    else {
                        copyFile(fs.createReadStream(path.join(fromPath, file)), toPath, file, function(err) {
                            if(err) reject(err);
                            else resolve();
                        })
                    }
                });
            }));
        });
        Promise.all(waitlist).then(function(vals) {
            callback();
        }).catch(function(err) {
            callback(err);
        });
    });
}