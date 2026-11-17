import path from 'node:path';
const root=process.cwd();
Bun.serve({
 hostname:'127.0.0.1',port:5187,
 async fetch(req) {
  try {
   const pathname=decodeURIComponent(new URL(req.url).pathname);
   const file=path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
   if(!file.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
   const data=Bun.file(file);
   if(!await data.exists())return new Response('Not found',{status:404});
   return new Response(data,{headers:{'Cache-Control':'no-cache'}});
  } catch {return new Response('Not found',{status:404});}
 }
});
