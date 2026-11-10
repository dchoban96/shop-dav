/*
  Login SQL dedicato al connettore dello shop (produzione). Da eseguire in SSMS come sa,
  sul server SQL di NTS, DOPO l'ok di chi gestisce il server.

  La password NON va scritta in questo file: sostituire <PASSWORD_LUNGA> solo nella finestra
  di SSMS al momento dell'esecuzione, poi chiudere senza salvare. La password va nel gestore
  password e nel file .env della macchina del connettore (MSSQL_USER=shop_dav).

  Permessi: solo quelli del brief, niente UPDATE né DELETE, niente altri database.
*/
USE master;
CREATE LOGIN shop_dav
  WITH PASSWORD = N'<PASSWORD_LUNGA>',
       CHECK_POLICY = ON,
       DEFAULT_DATABASE = NTS_FRONTIERA;
GO

USE NTS_FRONTIERA;
CREATE USER shop_dav FOR LOGIN shop_dav;
GRANT SELECT, INSERT ON dbo.GPH_TESTATA_NTS TO shop_dav;
GRANT SELECT, INSERT ON dbo.GPH_RIGA_NTS    TO shop_dav;
GRANT SELECT, INSERT ON dbo.GPH_SEMAFORO    TO shop_dav;
GO

USE DAVNTS;
CREATE USER shop_dav FOR LOGIN shop_dav;
GRANT SELECT ON dbo.testord TO shop_dav;
GRANT SELECT ON dbo.anagra  TO shop_dav;
GRANT SELECT ON dbo.artico  TO shop_dav;
-- import prezzi (npm run importa-prezzi): listini, sconti e storico di ordini, DDT e fatture
GRANT SELECT ON dbo.listini TO shop_dav;
GRANT SELECT ON dbo.sconti  TO shop_dav;
GRANT SELECT ON dbo.movord  TO shop_dav;
GRANT SELECT ON dbo.testmag TO shop_dav;
GRANT SELECT ON dbo.movmag  TO shop_dav;
GO

/*
  Verifica (connessi in SSMS come shop_dav, oppure "npm run controlla" con MSSQL_USER=shop_dav):
    SELECT TOP 1 * FROM NTS_FRONTIERA.dbo.GPH_TESTATA_NTS;   -- deve funzionare
    SELECT TOP 1 * FROM DAVNTS.dbo.provvig;                  -- deve dare errore di permessi (provvigioni)
*/
