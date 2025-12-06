'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('reviews', 'user_name', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('reviews', 'user_avatar', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('reviews', 'user_name');
    await queryInterface.removeColumn('reviews', 'user_avatar');
  }
};