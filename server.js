const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');

const app = express();

// 🔥 PORTA DINÂMICA (IMPORTANTE PARA RENDER)
const PORT = process.env.PORT || 3000;


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/imagens/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);

        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error("Apenas imagens são permitidas"));
        }
    }
});


app.use(cors({
    origin: "https://catalogoperfumesadm.onrender.com",
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'seu-segredo-super-secreto',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        sameSite: "none",
        maxAge: 3600000
    }
    }
));



function requireAuth(req, res, next) {
    if (req.session.authenticated) {
        return next();
    }
    return res.status(401).json({ error: "Não autorizado" });
}



app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (username === 'admin' && password === 'admin123') {
        req.session.authenticated = true;
        req.session.username = username;

        return res.json({ success: true });
    }

    return res.status(401).json({ success: false, message: "Credenciais inválidas" });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
    res.json({ authenticated: req.session.authenticated || false });
});


async function lerProdutos() {
    try {
        const data = await fs.readFile('produtos.json', 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

async function salvarProdutos(produtos) {
    await fs.writeFile('produtos.json', JSON.stringify(produtos, null, 2));
}


app.get('/api/perfumes', async (req, res) => {
    const produtos = await lerProdutos();
    res.json(produtos);
});

app.get('/api/perfumes/:id', async (req, res) => {
    const produtos = await lerProdutos();
    const perfume = produtos.find(p => p.id === parseInt(req.params.id));

    if (!perfume) {
        return res.status(404).json({ error: "Perfume não encontrado" });
    }

    res.json(perfume);
});

app.post('/api/perfumes', requireAuth, upload.array('imagens', 5), async (req, res) => {
    try {

        const produtos = await lerProdutos();
        const novoId = produtos.length
            ? Math.max(...produtos.map(p => p.id)) + 1
            : 1;

        const imagens = req.files
            ? req.files.map(file => `imagens/${file.filename}`)
            : [];

        const novoPerfume = {
            id: novoId,
            nome: req.body.nome,
            marca: req.body.marca,
            categoria: req.body.categoria,
            descricao: req.body.descricao,
            preco: req.body.preco,
            notasOlfativas: req.body.notasOlfativas,
            fixacao: req.body.fixacao,
            imagens
        };

        produtos.push(novoPerfume);
        await salvarProdutos(produtos);

        res.json({ success: true, perfume: novoPerfume });

    } catch (error) {
        res.status(500).json({ error: "Erro ao adicionar perfume" });
    }
});

app.put('/api/perfumes/:id', requireAuth, upload.array('imagens', 5), async (req, res) => {

    const produtos = await lerProdutos();
    const index = produtos.findIndex(p => p.id === parseInt(req.params.id));

    if (index === -1) {
        return res.status(404).json({ error: "Perfume não encontrado" });
    }

    let imagens = produtos[index].imagens || [];

    if (req.files && req.files.length > 0) {
        const novas = req.files.map(file => `imagens/${file.filename}`);
        imagens = [...imagens, ...novas];
    }

    produtos[index] = {
        ...produtos[index],
        nome: req.body.nome || produtos[index].nome,
        marca: req.body.marca || produtos[index].marca,
        categoria: req.body.categoria || produtos[index].categoria,
        descricao: req.body.descricao || produtos[index].descricao,
        preco: req.body.preco || produtos[index].preco,
        notasOlfativas: req.body.notasOlfativas || produtos[index].notasOlfativas,
        fixacao: req.body.fixacao || produtos[index].fixacao,
        imagens
    };

    await salvarProdutos(produtos);

    res.json({ success: true, perfume: produtos[index] });
});

app.delete('/api/perfumes/:id', requireAuth, async (req, res) => {

    const produtos = await lerProdutos();
    const index = produtos.findIndex(p => p.id === parseInt(req.params.id));

    if (index === -1) {
        return res.status(404).json({ error: "Perfume não encontrado" });
    }

    for (const imagem of produtos[index].imagens || []) {
        try {
            await fs.remove(`public/${imagem}`);
        } catch (err) {
            console.log("Erro ao remover imagem:", err);
        }
    }

    produtos.splice(index, 1);
    await salvarProdutos(produtos);

    res.json({ success: true });
});
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {

    console.log(`Servidor rodando na porta ${PORT}`);

    // Criar pasta imagens se não existir
    fs.ensureDirSync('public/imagens');

    // Criar produtos.json se não existir
    if (!fs.existsSync('produtos.json')) {
        fs.writeJsonSync('produtos.json', []);
    }
});