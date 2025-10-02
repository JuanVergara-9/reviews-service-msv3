'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Review', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    provider_id: { type: DataTypes.INTEGER, allowNull: false },
    rating: { type: DataTypes.SMALLINT, allowNull: false },
    comment: DataTypes.TEXT,
    photos: { type: DataTypes.JSONB, defaultValue: [] },
    verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    flagged: { type: DataTypes.BOOLEAN, defaultValue: false },
    ip: DataTypes.STRING(45),
    user_agent: DataTypes.TEXT
  }, { tableName: 'reviews', underscored: true });
};
