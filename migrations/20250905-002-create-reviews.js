'use strict';
module.exports = {
  async up(q, S) {
    await q.createTable('reviews', {
      id: { type: S.BIGINT, autoIncrement: true, primaryKey: true },
      user_id: { type: S.INTEGER, allowNull: false },
      provider_id: { type: S.INTEGER, allowNull: false },
      rating: { type: S.SMALLINT, allowNull: false }, // 1..5 (validamos en app)
      comment: { type: S.TEXT },
      photos: { type: S.JSONB, allowNull: false, defaultValue: [] }, // array de URLs
      verified: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
      flagged: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
      ip: { type: S.STRING(45) },
      user_agent: { type: S.TEXT },
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
    });
    await q.addIndex('reviews', ['provider_id', 'created_at'], { name: 'reviews_provider_created_idx' });
    await q.addIndex('reviews', ['user_id', 'provider_id', 'created_at'], { name: 'reviews_user_provider_created_idx' });
  },
  async down(q){ await q.dropTable('reviews'); }
};
