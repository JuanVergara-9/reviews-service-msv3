'use strict';
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ContactIntent', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    provider_id: { type: DataTypes.INTEGER, allowNull: false },
    channel: { type: DataTypes.STRING(16), allowNull: false }, // whatsapp|form
    message_preview: DataTypes.STRING(160),
    provider_responded_at: DataTypes.DATE,
    ip: DataTypes.STRING(45),
    device: DataTypes.TEXT
  }, { tableName: 'contact_intents', underscored: true });
};
