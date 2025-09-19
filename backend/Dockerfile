# Use uma imagem base oficial do Node.js na versão 18
FROM node:18-alpine

# Defina o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copie os arquivos de definição de dependências
COPY package*.json ./

# Instale apenas as dependências de produção para manter a imagem leve
RUN npm install --production

# Copie o código-fonte já compilado (da pasta dist)
COPY dist ./dist

# Exponha a porta em que a aplicação roda
EXPOSE 8080

# O comando para iniciar a aplicação quando o contêiner rodar
CMD [ "node", "dist/index.js" ]
