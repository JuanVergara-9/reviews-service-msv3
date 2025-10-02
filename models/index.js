'use strict';
const fs=require('fs'); const path=require('path');
const { Sequelize, DataTypes } = require('sequelize');
const env=process.env.NODE_ENV||'development';
const config=require('../config/database')[env];

const sequelize = config.url ? new Sequelize(config.url, config)
  : new Sequelize(config.database, config.username, config.password, config);

const db={};
fs.readdirSync(__dirname).filter(f=>f!=='index.js'&&f.endsWith('.js'))
  .forEach(f=>{ const m=require(path.join(__dirname,f))(sequelize,DataTypes); db[m.name]=m; });
Object.values(db).forEach(m=>m.associate && m.associate(db));

db.sequelize=sequelize; db.Sequelize=Sequelize; module.exports=db;
