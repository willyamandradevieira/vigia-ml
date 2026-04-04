# VigIA — Monitor de Concorrentes ML

## Variáveis de ambiente necessárias
- ML_CLIENT_ID — App ID do Mercado Livre Developers
- ML_CLIENT_SECRET — Secret Key do seu App

## Endpoints
- GET / — status do servidor
- POST /escanear-loja — escaneia todos os produtos de uma loja

## Exemplo de uso
POST /escanear-loja
{ "url_loja": "https://www.mercadolivre.com.br/loja/nomedavendedor" }
