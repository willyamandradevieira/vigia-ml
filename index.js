const express = require('express');
const app = express();
app.use(express.json());

async function getProdutosDaLoja(nickname) {
  // Busca a página pública da loja no ML
  const url = `https://www.mercadolivre.com.br/loja/${nickname}/mais-vendidos`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    }
  });
  
  const html = await res.text();
  console.log(`Status: ${res.status}, HTML length: ${html.length}`);
  
  // Extrai dados do JSON embutido na página
  const produtos = [];
  
  // Tenta extrair via script JSON na página
  const jsonMatch = html.match(/__PRELOADED_STATE__\s*=\s*({.+?});\s*<\/script>/s) ||
                    html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});\s*<\/script>/s);
  
  if (jsonMatch) {
    try {
      const json = JSON.parse(jsonMatch[1]);
      console.log('JSON encontrado, keys:', Object.keys(json).join(', '));
    } catch(e) {
      console.log('Erro ao parsear JSON:', e.message);
    }
  }

  // Extrai preços e títulos via regex
  const titulos = [...html.matchAll(/aria-label="([^"]{10,100})"/g)].map(m => m[1]);
  const precos = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*),(\d{2})/g)].map(m => 
    parseFloat(m[1].replace('.','') + '.' + m[2])
  );
  const links = [...html.matchAll(/href="(https:\/\/www\.mercadolivre\.com\.br\/[^"]+MLB[^"]+)"/g)]
    .map(m => m[1]).filter(l => !l.includes('classifieds'));

  console.log(`Títulos: ${titulos.length}, Preços: ${precos.length}, Links: ${links.length}`);

  // Monta lista de produtos
  const total = Math.max(links.length, 1);
  for (let i = 0; i < Math.min(total, 50); i++) {
    produtos.push({
      titulo: titulos[i] || `Produto ${i+1}`,
      preco: precos[i] || null,
      link: links[i] || null,
    });
  }

  return { html_length: html.length, status: res.status, produtos };
}

app.get('/', (req, res) => {
  res.json({ status: 'VigIA online', versao: '1.5' });
});

app.get('/token-test', (req, res) => {
  res.json({ ok: true, modo: 'scraping' });
});

app.post('/escanear-loja', async (req, res) => {
  try {
    const { url_loja, nickname } = req.body;
    
    let nick = nickname;
    if (!nick && url_loja) {
      const match = url_loja.match(/mercadolivre\.com\.br\/(?:loja\/)?([^\/\?#]+)/i);
      if (match) nick = match[1];
    }
    
    if (!nick) return res.status(400).json({ erro: 'Informe url_loja ou nickname' });
    
    console.log(`Escaneando loja: ${nick}`);
    const resultado = await getProdutosDaLoja(nick);
    
    res.json({
      nickname: nick,
      total_produtos: resultado.produtos.length,
      debug: { html_length: resultado.html_length, status: resultado.status },
      produtos: resultado.produtos,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VigIA v1.5 rodando na porta ${PORT}`));
