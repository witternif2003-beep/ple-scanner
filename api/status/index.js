module.exports=async(r,s)=>{s.setHeader("Access-Control-Allow-Origin","*");s.setHeader("Content-Type","application/json");s.status(200).json({status:"ok",version:"2.1.0",timestamp:Date.now()})};
