'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Review', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    provider_id: { type: DataTypes.INTEGER, allowNull: false },
    rating: { type: DataTypes.SMALLINT, allowNull: false },
    user_name: { type: DataTypes.STRING },
    user_avatar: { type: DataTypes.STRING },
    comment: DataTypes.TEXT,
    photos: { type: DataTypes.JSONB, defaultValue: [] },
    verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    flagged: { type: DataTypes.BOOLEAN, defaultValue: false },
    ip: DataTypes.STRING(45),
    user_agent: DataTypes.TEXT,
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'web' },
    ticket_id: { type: DataTypes.INTEGER, allowNull: true }
  }, { tableName: 'reviews', underscored: true });
};
