'use strict';
module.exports = {
  async up(q, S) {
    await q.createTable('contact_intents', {
      id: { type: S.UUID, primaryKey: true }, // lo generamos en app
      user_id: { type: S.INTEGER, allowNull: false },
      provider_id: { type: S.INTEGER, allowNull: false },
      channel: { type: S.STRING(16), allowNull: false }, // 'whatsapp' | 'form'
      message_preview: { type: S.STRING(160) },
      provider_responded_at: { type: S.DATE },
      ip: { type: S.STRING(45) },
      device: { type: S.TEXT },
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
    });
    await q.addIndex('contact_intents', ['user_id', 'provider_id', 'created_at'], { name: 'ci_user_provider_created_idx' });
    await q.addIndex('contact_intents', ['provider_id', 'created_at'], { name: 'ci_provider_created_idx' });
  },
  async down(q){ await q.dropTable('contact_intents'); }
};
