const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function getProdutosDaLoja(nickname) {
  const produtos = [];
  const paginas = 3; // busca até 3 páginas = ~144 produtos

  for (let pagina = 1; pagina <= paginas; pagina++) {
    const offset = (pagina - 1) * 48;
    const url = offset === 0
      ? `https://lista.mercadolivre.com.br/loja/${nickname}/`
      : `https://lista.mercadolivre.com.br/loja/${nickname}/_Desde_${offset + 1}`;

    console.log(`Buscando página ${pagina}: ${url}`);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      }
    });

    const html = await res.text();
    console.log(`Página ${pagina}: status ${res.status}, ${html.length} chars`);

    // Extrai títulos dos produtos
    const titulos = [...html.matchAll(/class="poly-component__title[^"]*"[^>]*>([^<]{10,150})<\/a>/g)]
      .map(m => m[1].trim());

    // Extrai preços — pega o valor principal (reais)
    const precos = [...html.matchAll(/class="andes-money-amount__fraction"[^>]*>([^<]+)<\/span>/g)]
      .map(m => parseFloat(m[1].replace(/\./g, '')))
      .filter(p => !isNaN(p) && p > 0);

    // Extrai links dos produtos
    const links = [...html.matchAll(/href="(https:\/\/www\.mercadolivre\.com\.br\/[^"]+)"/g)]
      .map(m => m[1])
      .filter(l => l.includes('MLB') && !l.includes('classifieds') && !l.includes('loja'));

    // Extrai avaliações
    const avaliacoes = [...html.matchAll(/class="poly-reviews__rating"[^>]*>([^<]+)<\/span>/g)]
      .map(m => parseFloat(m[1].trim()));

    // Extrai quantidade de vendas
    const vendas = [...html.matchAll(/class="poly-component__sold"[^>]*>([^<]+)<\/span>/g)]
      .map(m => m[1].trim());

    console.log(`Página ${pagina}: ${titulos.length} títulos, ${precos.length} preços, ${links.length} links`);

    const qtd = Math.max(titulos.length, links.length);
    for (let i = 0; i < qtd; i++) {
      if (!titulos[i] && !links[i]) continue;
      produtos.push({
        titulo: titulos[i] || `Produto ${produtos.length + 1}`,
        preco: precos[i] || null,
        link: links[i] || null,
        avaliacao: avaliacoes[i] || null,
        vendas: vendas[i] || null,
      });
    }

    // Se veio menos de 40 produtos nessa página, não tem mais
    if (titulos.length < 20) break;
  }

  return produtos;
}

app.get('/api/status', (req, res) => {
  res.json({ status: 'VigIA online', versao: '3.0' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/escanear-loja', async (req, res) => {
  try {
    const { nickname, url_loja } = req.body;
    let nick = nickname;
    if (!nick && url_loja) {
      const match = url_loja.match(/mercadolivre\.com\.br\/(?:loja\/)?([^\/\?#]+)/i);
      if (match) nick = match[1];
    }
    if (!nick) return res.status(400).json({ erro: 'Informe url_loja ou nickname' });

    nick = nick.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    console.log(`Escaneando: ${nick}`);
    const produtos = await getProdutosDaLoja(nick);

    if (produtos.length === 0) {
      return res.status(404).json({ erro: 'Nenhum produto encontrado. Verifique o nome da loja.' });
    }

    res.json({ nickname: nick, total_produtos: produtos.length, produtos });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VigIA v3.0 na porta ${PORT}`));
