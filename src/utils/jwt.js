const jwt = require('jsonwebtoken');
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
function verifyAccessToken(token, opts={}) {
  return jwt.verify(token, ACCESS_SECRET, { clockTolerance: 10, ...opts });
}
module.exports = { verifyAccessToken };
