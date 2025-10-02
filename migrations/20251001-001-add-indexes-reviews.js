'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addIndex('reviews', ['provider_id', 'created_at'], {
      name: 'idx_reviews_provider_created',
    });
    await queryInterface.addIndex('reviews', ['user_id', 'provider_id', 'created_at'], {
      name: 'idx_reviews_user_provider_created',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('reviews', 'idx_reviews_provider_created');
    await queryInterface.removeIndex('reviews', 'idx_reviews_user_provider_created');
  }
};


