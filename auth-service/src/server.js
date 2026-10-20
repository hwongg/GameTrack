require('dotenv').config();
const express=require('express');const helmet=require('helmet');const cors=require('cors');const cookieParser=require('cookie-parser');const rateLimit=require('express-rate-limit');const {sequelize}=require('./models');
const app=express();app.set('trust proxy',1);app.use(helmet());app.use(cors({origin:process.env.CORS_ORIGIN||'http://localhost:3000',credentials:true}));app.use(express.json({limit:'100kb'}));app.use(cookieParser());app.use(rateLimit({windowMs:900000,limit:150,standardHeaders:'draft-7',legacyHeaders:false}));
app.get('/health',(req,res)=>res.json({status:'ok',service:'auth-service'}));app.use('/api/auth/oidc',require('./oidc'));app.use('/api/auth',require('./auth'));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Error de autenticación'})});
sequelize.authenticate().then(()=>sequelize.sync()).then(()=>app.listen(3002,'0.0.0.0',()=>console.log('Auth en 3002'))).catch(err=>{console.error(err);process.exit(1)});
