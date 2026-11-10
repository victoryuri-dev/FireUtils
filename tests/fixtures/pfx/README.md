# Certificados de teste (.pfx)

Arquivos **apenas para teste**: certificado fictício ("FELLIPE ALVES DE SOUSA:00000000000",
emitido por uma CA de teste que não existe fora daqui), com chave descartável.
Senha de todos: `teste123`. Validade até 09/11/2028.

Cada arquivo usa uma cifra diferente de PKCS#12 e serve para garantir que o leitor
(`src/lib/pades.js` + `src/lib/pkcs12Legado.js`) continua aceitando todas. Foram gerados com
OpenSSL 3 a partir da mesma chave e do mesmo certificado, por exemplo:

    openssl pkcs12 -export -legacy -keypbe PBE-SHA1-RC2-128 -certpbe PBE-SHA1-RC2-128 \
      -inkey leaf.key -in leaf.pem -certfile ca.pem -out rc2-128.pfx -passout pass:teste123

| Arquivo | Cifra da chave / dos certificados | MAC |
|---|---|---|
| `legado-3des-rc2-40.pfx` | 3DES (3 chaves) / RC2 40 bits — o formato clássico do Windows | SHA-1 |
| `3des-rc2-128.pfx` | 3DES (3 chaves) / RC2 128 bits | SHA-1 |
| `3des-2chaves-rc2-40.pfx` | 3DES de 2 chaves / RC2 40 bits | SHA-1 |
| `rc4-128-rc2-40.pfx` | RC4 128 bits / RC2 40 bits | SHA-1 |
| `rc2-128.pfx` | RC2 128 bits / RC2 128 bits | SHA-1 |
| `aes256-mac-sha256.pfx` | AES-256 (PBES2) — padrão do OpenSSL 3 | SHA-256 |
