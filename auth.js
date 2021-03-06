"use strict";
const crypto = require('crypto');

const SALT_LEN = 16;

function getRandomString(len) {
    return crypto.randomBytes(Math.ceil(len/2)).toString('hex').slice(0, len);
}

function getToken(len) {
    return crypto.randomBytes(len).toString('base64').replace(/\//g,'_').replace(/\+/g,'-').slice(0, len);
}

function toBase64(str) {
    return new Buffer(str).toString('base64');
}

function fromBase64(str) {
    return new Buffer(str, 'base64').toString('ascii');
}

function hash(password, salt) {
    let hash = crypto.createHmac('sha512', salt);
    hash.update(password);
    return hash.digest('hex');
}

function generateHash(password) {
    let salt = getRandomString(SALT_LEN);
    let hashedPass = hash(password, salt);
    return {
        salt: salt,
        password: hashedPass
    }
}

module.exports = {
    getToken: getToken,
    hash: hash,
    generateHash: generateHash,
    toBase64: toBase64,
    fromBase64: fromBase64
}