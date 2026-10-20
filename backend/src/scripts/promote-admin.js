require('dotenv').config();
const { sequelize, User } = require('../models');
async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Uso: node src/scripts/promote-admin.js correo@ejemplo.com');
  await sequelize.authenticate();
  const user = await User.findOne({ where: { email } });
  if (!user) throw new Error('Usuario no encontrado. Regístralo primero.');
  await user.update({ role: 'admin' });
  console.log('Administrador configurado:', user.email);
}
main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => sequelize.close());
