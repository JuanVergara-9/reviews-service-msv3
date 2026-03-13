'use strict';

/** Integración WhatsApp: source (web/whatsapp), ticket_id, user_id nullable para reseñas verificadas por ticket */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('reviews', 'source', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'web'
    });
    await queryInterface.addColumn('reviews', 'ticket_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.changeColumn('reviews', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('reviews', 'source');
    await queryInterface.removeColumn('reviews', 'ticket_id');
    await queryInterface.changeColumn('reviews', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
  }
};
