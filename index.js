const express = require('express');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;

let accessToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Falha ao obter token: ' + JSON.stringify(data));
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function getSellerByNickname(nickname) {
  const token = await getToken();

  // Tenta buscar seller via search de produtos com nickname exato
  const res = await fetch(
    `https://api.mercadolibre.com/sites/MLB/search?nickname=${encodeURIComponent(nickname)}&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  console.log('Search response:', JSON.stringify(data).substring(0, 300));

  if (data.seller && data.seller.id) return data.seller.id;
  if (data.results && data.results.length > 0 && data.results[0].seller) {
    return data.results[0].seller.id;
  }

  // Tenta buscar diretamente pelo endpoint de usuários por nickname
  const res2 = await fetch(
    `https://api.mercadolibre.com/sites/MLB/search?seller_nickname=${encodeURIComponent(nickname)}&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data2 = await res2.json();
  console.log('Search2 response:', JSON.stringify(data2).substring(0, 300));
  if (data2.results && data2.results.length > 0 && data2.results[0].seller) {
    return data2.results[0].seller.id;
  }

  throw new Error(`Vendedor "${nickname}" não encontrado. Tente o link direto da loja.`);
}

async function getSellerProducts(sellerId) {
  const token = await getToken();
  let allItems = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const res = await fetch(
      `https://api.mercadolibre.com/sites/MLB/search?seller_id=${sellerId}&limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    const items = data.results || [];
    allItems = allItems.concat(items.map(item => ({
      id: item.id,
      titulo: item.title,
      preco: item.price,
      moeda: item.currency_id,
      avaliacao: item.reviews?.rating_average || null,
      total_vendas: item.sold_quantity || 0,
      link: item.permalink,
      thumbnail: item.thumbnail,
      categoria_id: item.category_id,
    })));
    if (items.length < limit) break;
    offset += limit;
    if (offset >= 200) break;
  }
  return allItems;
}

function extractNickname(url) {
  const match = url.match(/mercadolivre\.com\.br\/(?:loja\/)?([^\/\?#]+)/i);
  if (match) return match[1].toUpperCase();
  throw new Error('URL inválida.');
}

app.get('/', (req, res) => {
  res.json({ status: 'VigIA online', versao: '1.2' });
});

// Busca por seller_id direto
app.post('/escanear-loja', async (req, res) => {
  try {
    const { url_loja, seller_id } = req.body;

    let sellerId = seller_id;

    if (!sellerId) {
      if (!url_loja) return res.status(400).json({ erro: 'Informe url_loja ou seller_id' });
      const nickname = extractNickname(url_loja);
      console.log(`Buscando: ${nickname}`);
      sellerId = await getSellerByNickname(nickname);
    }

    console.log(`Seller ID: ${sellerId}`);
    const produtos = await getSellerProducts(sellerId);

    res.json({
      vendedor_id: sellerId,
      total_produtos: produtos.length,
      produtos,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ erro: err.message });
  }
});

// Teste de token
app.get('/token-test', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ ok: true, token_preview: token.substring(0, 20) + '...' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VigIA v1.2 rodando na porta ${PORT}`));
