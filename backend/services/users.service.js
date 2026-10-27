const { service } = require('./mongoIdentity.service');
module.exports = Object.fromEntries(['listUsers','getUserById','createUser','updateUser','updateUserPassword','deleteUser'].map(name => [name, (...args) => service[name](...args)]));
