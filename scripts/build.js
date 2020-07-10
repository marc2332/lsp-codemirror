const copy = require('copy');
const path = require('path')

copy(path.join(__dirname,'../src/*.css'),path.join(__dirname,'..','lib'),()=>{

})