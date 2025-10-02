require('dotenv').config();
const base = { dialect: 'postgres', logging: false, define:{underscored:true,timestamps:true}, timezone:'-03:00' };
module.exports = {
  development: {
    ...base,
    url: process.env.DATABASE_URL,
    dialectOptions: process.env.DB_SSL==='true' ? { ssl:{require:true, rejectUnauthorized:false} } : {}
  },
  production: {
    ...base,
    url: process.env.DATABASE_URL,
    dialectOptions: { ssl:{require:true, rejectUnauthorized:false} }
  },
  test: { ...base, url: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL }
};
