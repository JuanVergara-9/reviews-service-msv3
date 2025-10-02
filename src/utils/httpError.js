class HttpError extends Error { constructor(status, code, message){ super(message); this.status=status; this.code=code; } }
const badRequest=(c,m)=>new HttpError(400,c,m);
const unauthorized=(c,m)=>new HttpError(401,c,m);
const forbidden=(c,m)=>new HttpError(403,c,m);
const conflict=(c,m)=>new HttpError(409,c,m);
module.exports={ HttpError, badRequest, unauthorized, forbidden, conflict };
