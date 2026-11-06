// Host de homologacao local: sem sync, importadores, PWA ou acesso a backups reais.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function criarServidor() {
    return http.createServer((req,res) => {
        if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '') || req.method !== 'GET') {
            res.writeHead(403); return res.end();
        }
        const pathname = new URL(req.url,'http://127.0.0.1').pathname;
        const headers = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
            'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
            'Content-Security-Policy':"default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'" };
        if (pathname === '/') {
            const html = fs.readFileSync(path.join(root,'index.html'),'utf8')
                .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
                .replace(/<link[^>]*rel="manifest"[^>]*>/gi,'')
                .replace('</head>','<meta name="mtz-homologacao" content="orcamentos-sinteticos-v1"></head>')
                .replace('</body>','<script type="module" src="/homologacao/orcamentos.mjs"></script></body>');
            res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});return res.end(html);
        }
        // Allowlist estatica; nenhum arquivo de clientes, docs, .git ou evidencias e servido.
        if (!/^\/(assets\/(js\/(core|modules|ui)\/[a-z0-9.-]+\.(js|mjs)|css\/[a-z0-9.-]+\.css)|homologacao\/orcamentos\.mjs|logo\.png)$/.test(pathname)) {
            res.writeHead(404,headers);return res.end();
        }
        const file = path.join(root,pathname.slice(1));
        fs.readFile(file,(err,data)=>{
            if(err){res.writeHead(404,headers);return res.end();}
            const type={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'};
            res.writeHead(200,{...headers,'Content-Type':type[path.extname(file)]});res.end(data);
        });
    });
}
module.exports = { criarServidor };
if(require.main===module)criarServidor().listen(Number(process.argv[2]||54145),'127.0.0.1',()=>
    console.log('Homologacao sintetica: http://127.0.0.1:'+(process.argv[2]||54145)+'/'));
