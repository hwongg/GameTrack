const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(80), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false, unique: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING, allowNull: false, field: 'password_hash' },
  role: { type: DataTypes.ENUM('normal', 'admin'), allowNull: false, defaultValue: 'normal' }
}, { tableName: 'usuarios', underscored: true });

const Game = sequelize.define('Game', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  platform: { type: DataTypes.TEXT, allowNull: false },
  genre: { type: DataTypes.STRING(80), allowNull: false },
  coverUrl: { type: DataTypes.STRING(1000), allowNull: true, field: 'cover_url' },
  externalId: { type: DataTypes.STRING(100), allowNull: true, field: 'external_id' }
}, { tableName: 'juegos', underscored: true });

const Recommendation = sequelize.define('Recommendation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
  gameId: { type: DataTypes.UUID, allowNull: false, field: 'game_id' },
  hoursPlayed: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0, field: 'hours_played' },
  status: { type: DataTypes.ENUM('pendiente', 'jugando', 'completado', 'abandonado'), allowNull: false, defaultValue: 'pendiente' },
  favorite: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  score: { type: DataTypes.FLOAT, allowNull: true }
}, { tableName: 'recomendaciones', underscored: true, indexes: [{ unique: true, fields: ['user_id', 'game_id'] }] });

User.hasMany(Recommendation, { foreignKey: 'userId', onDelete: 'CASCADE' });
Recommendation.belongsTo(User, { foreignKey: 'userId' });
Game.hasMany(Recommendation, { foreignKey: 'gameId', onDelete: 'CASCADE' });
Recommendation.belongsTo(Game, { foreignKey: 'gameId' });

module.exports = { sequelize, User, Game, Recommendation };
