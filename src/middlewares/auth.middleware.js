const { unauthorized } = require('../utils/httpError');
const { verifyAccessToken } = require('../utils/jwt');

function requireAuth(req,_res,next){
  const hdr=req.headers.authorization||'';
  const token = hdr.startsWith('Bearer ')? hdr.slice(7) : null;
  if(!token) return next(unauthorized('AUTH.MISSING_TOKEN','Token requerido'));
  try{
    const p = verifyAccessToken(token);
    req.user = { userId: p.userId, role: p.role };
    next();
  } catch(e){
    const msg = /expired/i.test(e.message) ? 'Token expirado' : 'Token inválido';
    next(unauthorized('AUTH.INVALID_TOKEN', msg));
  }
}
module.exports = { requireAuth };
