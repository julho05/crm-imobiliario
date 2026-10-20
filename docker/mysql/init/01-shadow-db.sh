#!/bin/sh
# Roda uma unica vez, na primeira inicializacao do volume do MySQL.
#
# Por que existe: o "prisma migrate dev" cria e descarta um shadow database
# temporario para detectar desvios no schema. O usuario de aplicacao nao tem
# permissao para criar bancos, e sem este GRANT a migration falha com P3014.
#
# O privilegio e restrito ao padrao de nome do shadow database. O usuario de
# aplicacao continua sem poder criar qualquer outro banco.
#
# Isto e EXCLUSIVO DE DESENVOLVIMENTO. Em producao as migrations rodam com
# "prisma migrate deploy", que nao usa shadow database.
set -e

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
GRANT ALL PRIVILEGES ON \`prisma_migrate_shadow_db%\`.* TO '$MYSQL_USER'@'%';

-- Shadow database fixo, usado pelo "prisma migrate diff --from-migrations"
-- (a verificacao de desvio entre as migrations e o banco). Diferente dos
-- shadows temporarios do "migrate dev", este precisa existir de antemao.
CREATE DATABASE IF NOT EXISTS \`prisma_migrate_shadow_db_diff\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Banco dos testes de integracao, separado do de desenvolvimento. Os testes
-- limpam as tabelas entre casos, e isso nao pode apagar o que a pessoa
-- cadastrou enquanto trabalhava.
CREATE DATABASE IF NOT EXISTS \`crm_test\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON \`crm_test\`.* TO '$MYSQL_USER'@'%';

FLUSH PRIVILEGES;
SQL
