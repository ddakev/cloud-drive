"use strict";
const mysql = require('mysql'),
      uuid  = require('uuid'),
      auth  = require('./auth.js'),
      config = require('./config/config.js');

var pool = mysql.createPool(config.mysql_settings);

function validate(user, password) {
    return new Promise(function(resolve, reject) {
        pool.getConnection(function(err, connection) {
            if(err) {
                reject(err);
                connection.release();
                return;
            }
            let sql = "SELECT * FROM users WHERE username = ?";
            let inserts = [];
            inserts.push(user);
            connection.query(sql, inserts, function(err, result) {
                connection.release();
                if(err) {
                    reject(err);
                    return;
                }
                if(typeof result === "undefined" || result.length == 0) {
                    reject("No user " + user);
                    return;
                }
                resolve(auth.hash(password, result[0].salt) == result[0].password);
            });
        });
    });
}

function get(user) {
    return new Promise(function(resolve, reject) {
        pool.getConnection(function(err, connection) {
            if(err) {
                reject(err);
                connection.release();
                return;
            }
            let sql = "SELECT * FROM users";
            let inserts = [];
            if(user) {
                sql += "WHERE username = ?";
                inserts.push(user);
            }
            connection.query(sql, inserts, function(err, result) {
                connection.release();
                if(err) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
    });
}

function create(data) {
    return new Promise(function(resolve, reject) {
        pool.getConnection(function(err, connection) {
            if(err) {
                reject(err);
                connection.release();
                return;
            }
            let sql = "INSERT INTO users (id, username, password, salt) VALUES (?, ?, ?, ?)";
            let inserts = [];
            inserts.push(uuid());
            inserts.push(data.username);
            let authInfo = auth.generateHash(data.password);
            inserts.push(authInfo.password);
            inserts.push(authInfo.salt);
            connection.query(sql, inserts, function(err, result) {
                connection.release();
                if(err) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
    });
}

function update(user, data) {
    return new Promise(function(resolve, reject) {
        pool.getConnection(function(err, connection) {
            if(err) {
                reject(err);
                connection.release();
                return;
            }
            let sql = "UPDATE users SET";
            let inserts = [];
            let first = true;
            for(var prop in data) {
                if(data.hasOwnProperty(prop)) {
                    if(first) {
                        sql += " ";
                        first = false;
                    }
                    else sql += ", ";
                    sql += "? = ?";
                    inserts.push(prop, data[prop]);
                }
            }
            sql += " WHERE username = ?";
            inserts.push(user);
            connection.query(sql, inserts, function(err, result) {
                connection.release();
                if(err) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
    });
}

function remove(user) {
    return new Promise(function(resolve, reject) {
        pool.getConnection(function(err, connection) {
            if(err) {
                reject(err);
                connection.release();
                return;
            }
            let sql = "DELETE FROM users WHERE username = ?";
            let inserts = [];
            inserts.push(user);
            connection.query(sql, inserts, function(err, result) {
                connection.release();
                if(err) {
                    reject(err);
                    return;
                }
                resolve(result);
            });
        });
    });
}

function parseCookie(cookie) {
    cookie = JSON.parse(JSON.stringify(cookie));
    return new Promise(function(resolve, reject) {
        if(typeof cookie["DL"] === "undefined") {
            resolve(null);
            return;
        }
        pool.getConnection(function(err, connection) {
            let sql = "SELECT * FROM users WHERE id = ?";
            let inserts = [cookie["DL"]];
            connection.query(sql, inserts, function(err, result) {
                connection.release();
                if(err) {
                    reject(err);
                    return;
                }
                if(typeof result === "undefined" || result.length == 0) resolve(null);
                else resolve(result[0].username);
            });
        });
    });
}

function getCookie(username) {
    return new Promise(function(resolve, reject) {
        pool.getConnection(function(err, connection) {
            let sql = "SELECT * FROM users WHERE username = ?";
            let inserts = [username];
            connection.query(sql, inserts, function(err, result) {
                connection.release();
                if(err) {
                    reject(err);
                    return;
                }
                let cookie = result[0].id;
                resolve(cookie);
            });
        });
    });
}

module.exports = {
    get: get,
    create: create,
    update: update,
    remove: remove,
    validate: validate,
    parseCookie: parseCookie,
    getCookie: getCookie
}