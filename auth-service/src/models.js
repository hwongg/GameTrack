const { DataTypes } = require("sequelize");
const sequelize = require("./database");
const User = sequelize.define("User", { id:{type:DataTypes.UUID,defaultValue:DataTypes.UUIDV4,primaryKey:true},name:{type:DataTypes.STRING(80),allowNull:false},email:{type:DataTypes.STRING(254),allowNull:false,unique:true},passwordHash:{type:DataTypes.STRING,allowNull:false,field:"password_hash"},role:{type:DataTypes.ENUM("normal","admin"),allowNull:false,defaultValue:"normal"}},{tableName:"usuarios",underscored:true});
module.exports={sequelize,User};
